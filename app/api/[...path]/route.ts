import { database, databaseConfigured } from "@/db/connection";
import type { GameDatabase } from "@/db/connection";
export const runtime = "nodejs";
type EntryRow = { id: string; participant_id: string; name: string; entry_number: number; card_type: string; team_id: string | null; team_name: string | null; status: string; collected_at: string | null; merchant: string | null; card_value_cents: number; distributed_to: string | null; distributed_at: string | null; email?: string };
const envVars = process.env as Record<string, string | undefined>;
const json = (data: unknown, status = 200, headers: HeadersInit = {}) => Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
const nowIso = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const bytesHex = (bytes: Uint8Array) => [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (value: string) => new Uint8Array(value.match(/.{2}/g)?.map((x) => parseInt(x, 16)) ?? []);
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const encoder = new TextEncoder();

function requireDb(): GameDatabase {
  if (!databaseConfigured()) throw new Error("The Netlify Postgres database is not connected yet.");
  return database();
}

function currentDate() {
  if (envVars.SURVIVOR_TEST === "true" && envVars.SURVIVOR_TEST_DATE) return envVars.SURVIVOR_TEST_DATE;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function ensureSeason() {
  const database = requireDb();
  await database.prepare("INSERT OR IGNORE INTO seasons (id, year, title, status, registration_open) VALUES (?, ?, ?, 'planning', false)").bind("lakeshore-2026", 2026, "Lakeshore Holiday Spirit Survivor 2026").run();
  return database.prepare("SELECT * FROM seasons ORDER BY year DESC LIMIT 1").first<Record<string, unknown>>();
}

async function audit(action: string, entityType: string, entityId: string | null, details: Record<string, unknown> = {}) {
  const season = await ensureSeason();
  if (!season) return;
  await requireDb().prepare("INSERT INTO audit_log (id, season_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id(), season.id, action, entityType, entityId, JSON.stringify(details)).run();
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmac(secret: string, text: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(text)));
}

function cookieValue(request: Request, name: string) {
  return request.headers.get("Cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

async function isOrganizer(request: Request) {
  const secret = envVars.SESSION_SECRET;
  if (typeof secret !== "string" || secret.length < 32) return false;
  const token = cookieValue(request, "ls_survivor_session");
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  try {
    const expected = await hmac(secret, payload);
    const actual = fromB64(signature.replaceAll("-", "+").replaceAll("_", "/"));
    if (!constantTimeEqual(expected, actual)) return false;
    const decoded = JSON.parse(new TextDecoder().decode(fromB64(payload.replaceAll("-", "+").replaceAll("_", "/"))));
    return decoded.role === "organizer" && decoded.exp > Date.now();
  } catch { return false; }
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

async function getEntries(seasonId: string, withEmail = false): Promise<EntryRow[]> {
  const email = withEmail ? ", p.email" : "";
  return requireDb().prepare(`SELECT e.id, e.participant_id, p.name, e.entry_number, e.card_type, e.team_id, t.name AS team_name, e.status, e.collected_at, e.merchant, e.card_value_cents, e.distributed_to, e.distributed_at${email}
    FROM entries e JOIN participants p ON p.id = e.participant_id LEFT JOIN teams t ON t.id = e.team_id
    WHERE e.season_id = ? AND e.status != 'cancelled' ORDER BY t.name, p.name, e.entry_number`).bind(seasonId).all<EntryRow>().then((r) => r.results ?? []);
}

function publicEntry(e: EntryRow) {
  return { id: e.id, name: e.name, entryNumber: e.entry_number, category: e.card_type, teamId: e.team_id, teamName: e.team_name, status: e.status, eliminated: e.status === "eliminated" };
}

async function publicData() {
  const season = await ensureSeason();
  if (!season) return { season: null };
  const seasonId = String(season.id);
  const [entries, teamsResult, scheduleResult, eliminationResult, auditResult] = await Promise.all([
    getEntries(seasonId),
    requireDb().prepare("SELECT t.id, t.name, COUNT(CASE WHEN e.status = 'active' THEN 1 END) AS survivors, COUNT(e.id) AS total_entries FROM teams t LEFT JOIN entries e ON e.team_id = t.id AND e.status != 'cancelled' WHERE t.season_id = ? GROUP BY t.id ORDER BY t.name").bind(seasonId).all(),
    requireDb().prepare("SELECT id, draw_date, draws_planned FROM elimination_schedule WHERE season_id = ? ORDER BY draw_date").bind(seasonId).all(),
    requireDb().prepare("SELECT x.id, x.entry_id, x.draw_number, x.draw_method, x.pool_count, x.pool_hash, x.random_proof, x.random_attempt, x.selected_index, x.created_at, s.draw_date, x.schedule_id, p.name, e.entry_number, e.card_type, t.name AS team_name FROM eliminations x JOIN entries e ON e.id = x.entry_id JOIN participants p ON p.id = e.participant_id LEFT JOIN teams t ON t.id = e.team_id LEFT JOIN elimination_schedule s ON s.id = x.schedule_id WHERE x.season_id = ? ORDER BY x.draw_number DESC").bind(seasonId).all(),
    requireDb().prepare("SELECT action, entity_type, entity_id, details, created_at FROM audit_log WHERE season_id = ? ORDER BY created_at DESC LIMIT 100").bind(seasonId).all(),
  ]);
  const cards = entries.filter((e) => e.collected_at);
  const teams = teamsResult.results ?? [];
  const activeEntries = entries.filter((e) => e.status === "active");
  const history = eliminationResult.results ?? [];
  return {
    season: { id: season.id, year: season.year, title: season.title, status: season.status, registrationOpen: Boolean(season.registration_open), winnerTeamId: season.winner_team_id, auditCommit: season.audit_commit, auditLockedAt: season.audit_locked_at, auditSeedReveal: season.status === "complete" ? season.audit_seed : null, drawCount: season.draw_count },
    stats: { entries: entries.length, survivors: activeEntries.length, eliminated: history.length, teams: teams.length, collectedCards: cards.length, regularCards: cards.filter((e) => e.card_type === "regular").length, spiritsCards: cards.filter((e) => e.card_type === "spirits").length, prizeValueCents: cards.reduce((sum, e) => sum + e.card_value_cents, 0) },
    entries: entries.map(publicEntry), teams, schedule: scheduleResult.results ?? [], eliminations: history,
    audit: auditResult.results ?? [],
  };
}

async function organizerData() {
  const data = await publicData();
  if (!data.season) return data;
  const entries = await getEntries(String(data.season.id), true);
  let winnerMembers: Array<{ name: string; team_entries: number; distributed_cards: number }> = [];
  if (data.season.winnerTeamId) {
    const database = requireDb();
    const [members, distributions] = await Promise.all([
      database.prepare("SELECT p.name, COUNT(e.id) AS team_entries FROM entries e JOIN participants p ON p.id = e.participant_id WHERE e.season_id = ? AND e.team_id = ? GROUP BY p.id, p.name ORDER BY p.name").bind(data.season.id, data.season.winnerTeamId).all<{ name: string; team_entries: number }>(),
      database.prepare("SELECT LOWER(distributed_to) AS recipient, COUNT(*) AS distributed_cards FROM entries WHERE season_id = ? AND distributed_to IS NOT NULL GROUP BY LOWER(distributed_to)").bind(data.season.id).all<{ recipient: string; distributed_cards: number }>(),
    ]);
    const distributedByName = new Map((distributions.results ?? []).map((row) => [row.recipient, row.distributed_cards]));
    winnerMembers = (members.results ?? []).map((member) => ({ ...member, distributed_cards: distributedByName.get(member.name.toLowerCase()) ?? 0 }));
  }
  return { ...data, winnerMembers, entries: entries.map((e) => ({ ...publicEntry(e), email: e.email, collectedAt: e.collected_at, merchant: e.merchant, cardValueCents: e.card_value_cents, distributedTo: e.distributed_to, distributedAt: e.distributed_at })) };
}

async function checkRateLimit(request: Request, bucketType: string, limit: number) {
  const database = requireDb();
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / 3600) * 3600;
  const secret = typeof envVars.SESSION_SECRET === "string" ? envVars.SESSION_SECRET : "lakeshore-registration-rate-limit";
  const rawIp = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For")?.split(",")[0] ?? "unknown";
  const bucket = bytesHex(await hmac(secret, `${bucketType}|${rawIp.trim()}`));
  await database.prepare("INSERT INTO registration_rate_limits (id, bucket, window_start, request_count) VALUES (?, ?, ?, 1) ON CONFLICT(bucket, window_start) DO UPDATE SET request_count = registration_rate_limits.request_count + 1")
    .bind(id(), bucket, windowStart).run();
  const row = await database.prepare("SELECT request_count FROM registration_rate_limits WHERE bucket = ? AND window_start = ?").bind(bucket, windowStart).first<{ request_count: number }>();
  await database.prepare("DELETE FROM registration_rate_limits WHERE window_start < ?").bind(windowStart - 24 * 60 * 60).run();
  return (row?.request_count ?? 0) <= limit;
}

async function lockSession(payload: Record<string, unknown>) {
  const key = envVars.SESSION_SECRET;
  if (typeof key !== "string" || key.length < 32) throw new Error("Organizer access has not been configured yet.");
  const tokenPayload = toB64(encoder.encode(JSON.stringify({ role: "organizer", exp: Date.now() + 8 * 60 * 60 * 1000, ...payload })))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const signature = toB64(await hmac(key, tokenPayload)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `${tokenPayload}.${signature}`;
}

async function verifyPassword(password: string) {
  const configuredPassword = envVars.ORGANIZER_PASSWORD;
  if (typeof configuredPassword === "string") {
    return constantTimeEqual(encoder.encode(password), encoder.encode(configuredPassword));
  }
  const saltB64 = envVars.ORGANIZER_PASSWORD_SALT;
  const expectedB64 = envVars.ORGANIZER_PASSWORD_HASH;
  if (typeof saltB64 !== "string" || typeof expectedB64 !== "string") return false;
  try {
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromB64(saltB64), iterations: 310000 }, key, 256);
    return constantTimeEqual(new Uint8Array(bits), fromB64(expectedB64));
  } catch { return false; }
}

async function recordAdminAction(action: string, entityId: string | null, details: Record<string, unknown> = {}) {
  await audit(action, "season", entityId, details);
}

const teamNames = [
  "The Sleigh Allstars", "Grinches With Benefits", "Eggnog & Regret", "The Gifted Survivors", "Tinsel Tantrum", "Santa's Little Side Hustle", "The Merry Misfits", "The Ho-Ho-Holdouts", "Yule Be Sorry", "The North Pole Posse", "Deck the Halls & Take Names", "The Last-Minute Legends", "Jingle Bell Rock Bottom", "The Re-Gifters", "Sleigh What?", "The Silent Fright", "Mistletoe Mayhem", "The Naughty List Alumni", "Stocking Stuffers Anonymous", "The Spirit of Competition", "The Caroling Casualties", "Frosty Bottoms", "The Gift Cardigans", "The Wrap Battle", "Oh Deer, We're Still Here", "The Polar Opposites", "The Tinsel Titans", "The Bauble Trouble", "Noel It Alls", "The Holiday Hoarders", "The Cookie Crumbles", "The Present Tense", "The Cheerful Underdogs", "The Kringle Crushers", "The Jolly Ranchers", "Fa La La La Last", "The Sleighmates", "The Yule Loggers", "The Mistletoe Mob", "The Twinkle Twisters", "The One-Hit Wonders", "The Wreath Reckoning", "Merry & Slightly Menacing", "The Reindeer Games", "The Festive Fugitives", "The Cranberry Bunch", "The Turtleneck Terrors", "The Cheer Force", "The Gingerbread Breakers", "The Holiday Survivors Club", "The Sparkle Snatchers", "The Tinsel Tacticians", "A Very Merry Problem", "The Jingle Juggernauts", "The Baubleheads", "The Peppermint Posse", "The Winter Winners", "The Hark Side", "The Great Gift Escape", "The Yule Tide Turners", "The Sleigh Day Crew", "The Frosty Finishers", "The Halls of Fame", "The Cheerful Chaos Crew",
];

function secureIndex(max: number) {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return Math.floor((bytes[0] / 0x1_0000_0000) * max);
}

function shuffle<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i--) { const j = secureIndex(i + 1); [items[i], items[j]] = [items[j], items[i]]; }
  return items;
}

async function hashText(text: string) { return bytesHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)))); }

async function assignedTeams(seasonId: string) {
  const database = requireDb();
  const entries = await database.prepare("SELECT id, participant_id, card_type FROM entries WHERE season_id = ? AND status = 'active' ORDER BY id").bind(seasonId).all<{ id: string; participant_id: string; card_type: string }>();
  if ((entries.results ?? []).length < 2) throw new Error("At least two paid entries are needed to form teams.");
  const uncollected = await database.prepare("SELECT COUNT(*) AS n FROM entries WHERE season_id = ? AND status = 'active' AND collected_at IS NULL").bind(seasonId).first<{ n: number }>();
  if ((uncollected?.n ?? 0) > 0) throw new Error("Confirm collection of every $25 gift card before creating teams.");
  const participantCounts = new Map<string, number>();
  for (const entry of entries.results ?? []) participantCounts.set(entry.participant_id, (participantCounts.get(entry.participant_id) ?? 0) + 1);
  // Place multi-entry participants first so the separate-team constraint is
  // accounted for before single entries fill the remaining balanced slots.
  const entriesList = shuffle(entries.results ?? []).sort((a, b) => (participantCounts.get(b.participant_id) ?? 0) - (participantCounts.get(a.participant_id) ?? 0));
  const teamCount = Math.min(entriesList.length, Math.max(2, Math.ceil(entriesList.length / 5)));
  let names = shuffle([...teamNames]);
  const groups: Array<{ id: string; name: string; members: Set<string>; entries: string[]; regular: number; spirits: number }> = Array.from({ length: teamCount }, () => ({ id: id(), name: names.pop()!, members: new Set(), entries: [], regular: 0, spirits: 0 }));
  for (const entry of entriesList) {
    const eligible = groups.filter((g) => !g.members.has(entry.participant_id));
    if (!eligible.length) throw new Error("Could not balance entries across teams. Adjust the entry count and try again.");
    const minimum = Math.min(...eligible.map((g) => g.entries.length));
    const sizeBalanced = eligible.filter((g) => g.entries.length === minimum);
    const minimumCategoryCount = Math.min(...sizeBalanced.map((g) => entry.card_type === "spirits" ? g.spirits : g.regular));
    const pool = sizeBalanced.filter((g) => (entry.card_type === "spirits" ? g.spirits : g.regular) === minimumCategoryCount);
    const team = pool[secureIndex(pool.length)];
    team.members.add(entry.participant_id); team.entries.push(entry.id);
    if (entry.card_type === "spirits") team.spirits++; else team.regular++;
  }
  return groups;
}

async function getSeason() { const season = await ensureSeason(); if (!season) throw new Error("Season is unavailable."); return season; }

async function action(body: Record<string, unknown>) {
  const database = requireDb();
  const season = await getSeason();
  const sid = String(season.id);
  const kind = String(body.action ?? "");
  if (kind === "registration") {
    const open = body.open === true;
    if (season.status === "complete") throw new Error("This season has finished.");
    const teamsExist = await database.prepare("SELECT id FROM teams WHERE season_id = ? LIMIT 1").bind(sid).first();
    if (open && teamsExist) throw new Error("Registration cannot reopen after teams have been generated.");
    await database.prepare("UPDATE seasons SET registration_open = ?, status = ? WHERE id = ?").bind(open, open ? "registration" : (season.status === "registration" ? "planning" : season.status), sid).run();
    await recordAdminAction(open ? "registration_opened" : "registration_closed", sid);
    return { ok: true };
  }
  if (kind === "collect") {
    const entryId = String(body.entryId ?? ""); const merchant = String(body.merchant ?? "").trim();
    if (!merchant || merchant.length > 80) throw new Error("Enter the gift card retailer or source.");
    const result = await database.prepare("UPDATE entries SET collected_at = ?, merchant = ?, card_value_cents = 2500 WHERE id = ? AND season_id = ? AND status != 'cancelled'").bind(nowIso(), merchant, entryId, sid).run();
    if (!result.meta.changes) throw new Error("Entry not found.");
    await recordAdminAction("gift_card_collected", entryId, { merchant, valueCents: 2500 });
    return { ok: true };
  }
  if (kind === "uncollect") {
    const entryId = String(body.entryId ?? "");
    await database.prepare("UPDATE entries SET collected_at = NULL, merchant = NULL WHERE id = ? AND season_id = ? AND distributed_at IS NULL").bind(entryId, sid).run();
    await recordAdminAction("gift_card_collection_reversed", entryId);
    return { ok: true };
  }
  if (kind === "teams") {
    if (season.registration_open) throw new Error("Close registration before creating teams.");
    if (Number(season.draw_count) > 0) throw new Error("Teams cannot be changed after eliminations begin.");
    const old = await database.prepare("SELECT COUNT(*) AS n FROM teams WHERE season_id = ?").bind(sid).first<{ n: number }>();
    if ((old?.n ?? 0) > 0) throw new Error("Teams already exist. Contact the organizer before rebuilding them.");
    const groups = await assignedTeams(sid);
    const statements = groups.flatMap((team) => [
      database.prepare("INSERT INTO teams (id, season_id, name) VALUES (?, ?, ?)").bind(team.id, sid, team.name),
      ...team.entries.map((entryId) => database.prepare("UPDATE entries SET team_id = ? WHERE id = ? AND season_id = ?").bind(team.id, entryId, sid)),
    ]);
    statements.push(database.prepare("UPDATE seasons SET registration_open = false, status = 'ready' WHERE id = ?").bind(sid));
    await database.batch(statements);
    await recordAdminAction("teams_created", sid, { teamCount: groups.length, teamNames: groups.map((g) => g.name), entryCount: groups.reduce((n, g) => n + g.entries.length, 0) });
    return { ok: true, teams: groups.map(({ id, name, entries }) => ({ id, name, entryCount: entries.length })) };
  }
  if (kind === "schedule_add") {
    const date = String(body.date ?? ""); const count = Number(body.count ?? 1);
    const parsedDate = new Date(`${date}T12:00:00Z`);
    if (!new RegExp(`^${season.year}-\\d{2}-\\d{2}$`).test(date) || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== date) throw new Error(`Choose a valid ${season.year} date.`);
    const weekday = parsedDate.getUTCDay();
    if (weekday === 0 || weekday === 6) throw new Error("Draws can only be scheduled Monday to Friday.");
    if (season.year === 2026 && date < "2026-12-07") throw new Error("The first 2026 draw must be no earlier than Monday, December 7.");
    if (season.year === 2026 && date > "2026-12-18") throw new Error("The final 2026 draw must be no later than Friday, December 18.");
    if (date < currentDate()) throw new Error("Choose today or a future date for the draw schedule.");
    if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error("Choose between one and ten eliminations per date.");
    const scheduleId = id();
    await database.prepare("INSERT INTO elimination_schedule (id, season_id, draw_date, draws_planned) VALUES (?, ?, ?, ?) ON CONFLICT(season_id, draw_date) DO UPDATE SET draws_planned = excluded.draws_planned")
      .bind(scheduleId, sid, date, count).run();
    await recordAdminAction("schedule_updated", scheduleId, { date, count });
    return { ok: true };
  }
  if (kind === "schedule_remove") {
    const scheduleId = String(body.scheduleId ?? "");
    const used = await database.prepare("SELECT COUNT(*) AS n FROM eliminations WHERE schedule_id = ?").bind(scheduleId).first<{ n: number }>();
    if (used?.n) throw new Error("A date with completed draws cannot be removed.");
    await database.prepare("DELETE FROM elimination_schedule WHERE id = ? AND season_id = ?").bind(scheduleId, sid).run();
    await recordAdminAction("schedule_removed", scheduleId);
    return { ok: true };
  }
  if (kind === "lock_audit") {
    if (!await database.prepare("SELECT id FROM teams WHERE season_id = ? LIMIT 1").bind(sid).first()) throw new Error("Create balanced teams before locking the draw.");
    if (!await database.prepare("SELECT id FROM elimination_schedule WHERE season_id = ? LIMIT 1").bind(sid).first()) throw new Error("Add at least one draw date before locking the public commitment.");
    if (season.audit_commit) throw new Error("The draw commitment is already locked.");
    const seedBytes = crypto.getRandomValues(new Uint8Array(32)); const seed = bytesHex(seedBytes); const commit = await hashText(seed);
    await database.prepare("UPDATE seasons SET audit_seed = ?, audit_commit = ?, audit_locked_at = ?, status = 'active', registration_open = false WHERE id = ? AND audit_commit IS NULL").bind(seed, commit, nowIso(), sid).run();
    await recordAdminAction("draw_seed_committed", sid, { commitment: commit });
    return { ok: true, commitment: commit };
  }
  if (kind === "draw") {
    if (!season.audit_seed || !season.audit_commit) throw new Error("Lock the public draw commitment before drawing.");
    if (season.status === "complete") throw new Error("A winning team has already been determined.");
    const date = currentDate();
    const schedule = await database.prepare("SELECT id, draws_planned FROM elimination_schedule WHERE season_id = ? AND draw_date = ?").bind(sid, date).first<{ id: string; draws_planned: number }>();
    if (!schedule) throw new Error(`No elimination is scheduled for ${date} in Calgary.`);
    const done = await database.prepare("SELECT COUNT(*) AS n FROM eliminations WHERE schedule_id = ?").bind(schedule.id).first<{ n: number }>();
    if ((done?.n ?? 0) >= schedule.draws_planned) throw new Error("All eliminations scheduled for today are complete.");
    const pool = await database.prepare("SELECT e.id FROM entries e WHERE e.season_id = ? AND e.status = 'active' AND e.team_id IS NOT NULL ORDER BY e.id").bind(sid).all<{ id: string }>();
    const candidateIds = (pool.results ?? []).map((e) => e.id);
    if (!candidateIds.length) throw new Error("There are no active entries left to draw.");
    const poolHash = await hashText(JSON.stringify(candidateIds));
    const drawNumber = Number(season.draw_count ?? 0) + 1;
    const seedKey = await crypto.subtle.importKey("raw", fromHex(String(season.audit_seed)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const max = 1n << 256n; const bound = (max / BigInt(candidateIds.length)) * BigInt(candidateIds.length);
    let proof = new Uint8Array(); let attempt = 0; let value = 0n;
    do {
      proof = new Uint8Array(await crypto.subtle.sign("HMAC", seedKey, encoder.encode(`${sid}|${drawNumber}|${poolHash}|${attempt}`)));
      value = BigInt(`0x${bytesHex(proof)}`); if (value < bound) break; attempt++;
    } while (attempt < 8);
    const selectedIndex = Number(value % BigInt(candidateIds.length)); const selectedId = candidateIds[selectedIndex];
    const entry = await database.prepare("SELECT e.id, e.entry_number, p.name, e.team_id, t.name AS team_name FROM entries e JOIN participants p ON p.id = e.participant_id LEFT JOIN teams t ON t.id = e.team_id WHERE e.id = ?").bind(selectedId).first<{ id: string; entry_number: number; name: string; team_id: string; team_name: string }>();
    if (!entry) throw new Error("The draw pool changed. Refresh and try again.");
    const eliminationId = id(); const scheduleDrawCount = (done?.n ?? 0) + 1;
    await database.batch([
      database.prepare("INSERT INTO eliminations (id, season_id, entry_id, schedule_id, draw_number, draw_method, pool_count, pool_hash, random_proof, random_attempt, selected_index) VALUES (?, ?, ?, ?, ?, 'random', ?, ?, ?, ?, ?)").bind(eliminationId, sid, selectedId, schedule.id, drawNumber, candidateIds.length, poolHash, bytesHex(proof), attempt, selectedIndex),
      database.prepare("UPDATE entries SET status = 'eliminated' WHERE id = ? AND status = 'active'").bind(selectedId),
      database.prepare("UPDATE seasons SET draw_count = draw_count + 1 WHERE id = ?").bind(sid),
      database.prepare("INSERT INTO audit_log (id, season_id, action, entity_type, entity_id, details) VALUES (?, ?, 'entry_eliminated', 'entry', ?, ?)").bind(id(), sid, selectedId, JSON.stringify({ drawNumber, poolCount: candidateIds.length, poolHash, randomProof: bytesHex(proof), randomAttempt: attempt, selectedIndex, scheduleDate: date })),
    ]);
    const survivingTeams = await database.prepare("SELECT DISTINCT team_id FROM entries WHERE season_id = ? AND status = 'active' AND team_id IS NOT NULL").bind(sid).all<{ team_id: string }>();
    let winner = null;
    if ((survivingTeams.results ?? []).length === 1) {
      winner = survivingTeams.results![0].team_id;
      await database.prepare("UPDATE seasons SET winner_team_id = ?, status = 'complete', registration_open = false WHERE id = ?").bind(winner, sid).run();
      await recordAdminAction("winning_team_detected", winner, { drawNumber });
    }
    return { ok: true, draw: { id: eliminationId, drawNumber, method: "random", name: entry.name, entryNumber: entry.entry_number, teamName: entry.team_name, poolCount: candidateIds.length, poolHash, randomProof: bytesHex(proof), randomAttempt: attempt, selectedIndex, createdAt: nowIso() }, scheduleDrawCount, winnerTeamId: winner };
  }
  if (kind === "hat_draw") {
    if (!season.audit_seed || !season.audit_commit) throw new Error("Lock the public draw commitment before recording a draw.");
    if (season.status === "complete") throw new Error("A winning team has already been determined.");
    const date = currentDate();
    const schedule = await database.prepare("SELECT id, draws_planned FROM elimination_schedule WHERE season_id = ? AND draw_date = ?").bind(sid, date).first<{ id: string; draws_planned: number }>();
    if (!schedule) throw new Error(`No elimination is scheduled for ${date} in Calgary.`);
    const done = await database.prepare("SELECT COUNT(*) AS n FROM eliminations WHERE schedule_id = ?").bind(schedule.id).first<{ n: number }>();
    if ((done?.n ?? 0) >= schedule.draws_planned) throw new Error("All eliminations scheduled for today are complete.");
    const pool = await database.prepare("SELECT e.id FROM entries e WHERE e.season_id = ? AND e.status = 'active' AND e.team_id IS NOT NULL ORDER BY e.id").bind(sid).all<{ id: string }>();
    const candidateIds = (pool.results ?? []).map((e) => e.id);
    if (!candidateIds.length) throw new Error("There are no active entries left to draw.");
    const selectedId = String(body.entryId ?? "");
    const selectedIndex = candidateIds.indexOf(selectedId);
    if (selectedIndex < 0) throw new Error("Choose an active entry from the eligible draw list.");
    const poolHash = await hashText(JSON.stringify(candidateIds));
    const drawNumber = Number(season.draw_count ?? 0) + 1;
    const entry = await database.prepare("SELECT e.id, e.entry_number, p.name, e.team_id, t.name AS team_name FROM entries e JOIN participants p ON p.id = e.participant_id LEFT JOIN teams t ON t.id = e.team_id WHERE e.id = ? AND e.status = 'active'").bind(selectedId).first<{ id: string; entry_number: number; name: string; team_id: string; team_name: string }>();
    if (!entry) throw new Error("That entry is no longer active. Refresh and choose again.");
    const eliminationId = id();
    const scheduleDrawCount = (done?.n ?? 0) + 1;
    await database.batch([
      database.prepare("INSERT INTO eliminations (id, season_id, entry_id, schedule_id, draw_number, draw_method, pool_count, pool_hash, random_proof, random_attempt, selected_index) VALUES (?, ?, ?, ?, ?, 'hat', ?, ?, '', 0, ?)").bind(eliminationId, sid, selectedId, schedule.id, drawNumber, candidateIds.length, poolHash, selectedIndex),
      database.prepare("UPDATE entries SET status = 'eliminated' WHERE id = ? AND status = 'active'").bind(selectedId),
      database.prepare("UPDATE seasons SET draw_count = draw_count + 1 WHERE id = ?").bind(sid),
      database.prepare("INSERT INTO audit_log (id, season_id, action, entity_type, entity_id, details) VALUES (?, ?, 'hat_draw_recorded', 'entry', ?, ?)").bind(id(), sid, selectedId, JSON.stringify({ drawNumber, poolCount: candidateIds.length, poolHash, selectedIndex, scheduleDate: date, method: "hat" })),
    ]);
    const survivingTeams = await database.prepare("SELECT DISTINCT team_id FROM entries WHERE season_id = ? AND status = 'active' AND team_id IS NOT NULL").bind(sid).all<{ team_id: string }>();
    let winner = null;
    if ((survivingTeams.results ?? []).length === 1) {
      winner = survivingTeams.results![0].team_id;
      await database.prepare("UPDATE seasons SET winner_team_id = ?, status = 'complete', registration_open = false WHERE id = ?").bind(winner, sid).run();
      await recordAdminAction("winning_team_detected", winner, { drawNumber });
    }
    return { ok: true, draw: { id: eliminationId, drawNumber, method: "hat", name: entry.name, entryNumber: entry.entry_number, teamName: entry.team_name, poolCount: candidateIds.length, poolHash, selectedIndex, createdAt: nowIso() }, scheduleDrawCount, winnerTeamId: winner };
  }
  if (kind === "distribute") {
    if (!season.winner_team_id) throw new Error("Prize distribution opens after the winning team is determined.");
    const entryId = String(body.entryId ?? ""); const recipient = String(body.recipient ?? "").trim();
    if (!recipient || recipient.length > 100) throw new Error("Enter the recipient's name.");
    const member = await database.prepare("SELECT p.name FROM entries e JOIN participants p ON p.id = e.participant_id WHERE e.season_id = ? AND e.team_id = ? AND LOWER(p.name) = LOWER(?) LIMIT 1").bind(sid, season.winner_team_id, recipient).first();
    if (!member) throw new Error("Choose a member of the winning team.");
    const result = await database.prepare("UPDATE entries SET distributed_to = ?, distributed_at = ? WHERE id = ? AND season_id = ? AND collected_at IS NOT NULL AND distributed_at IS NULL")
      .bind(recipient, nowIso(), entryId, sid).run();
    if (!result.meta.changes) throw new Error("That card is not available for distribution.");
    await recordAdminAction("prize_distributed", entryId, { recipient });
    return { ok: true };
  }
  if (kind === "auto_distribute") {
    if (!season.winner_team_id) throw new Error("Prize distribution opens after the winning team is determined.");
    const members = await database.prepare("SELECT DISTINCT p.name FROM entries e JOIN participants p ON p.id = e.participant_id WHERE e.season_id = ? AND e.team_id = ? ORDER BY p.name").bind(sid, season.winner_team_id).all<{ name: string }>();
    const cards = await database.prepare("SELECT id FROM entries WHERE season_id = ? AND collected_at IS NOT NULL ORDER BY id").bind(sid).all<{ id: string }>();
    const alreadyDistributed = await database.prepare("SELECT COUNT(*) AS n FROM entries WHERE season_id = ? AND distributed_at IS NOT NULL").bind(sid).first<{ n: number }>();
    if (!members.results?.length || !cards.results?.length) throw new Error("The winning team or gift-card inventory is empty.");
    if ((alreadyDistributed?.n ?? 0) > 0) throw new Error("Some cards have already been distributed. Finish the remaining cards manually.");
    const names = members.results.map((member) => member.name);
    const statements = cards.results.map((card, index) => database.prepare("UPDATE entries SET distributed_to = ?, distributed_at = ? WHERE id = ? AND distributed_at IS NULL").bind(names[index % names.length], nowIso(), card.id));
    await database.batch(statements);
    const assigned = Object.fromEntries(names.map((name) => [name, Math.floor(cards.results!.length / names.length) + (names.indexOf(name) < cards.results!.length % names.length ? 1 : 0)]));
    await recordAdminAction("prize_split_evenly", String(season.winner_team_id), { cards: cards.results.length, teamMembers: names.length, assigned });
    return { ok: true, assigned };
  }
  if (kind === "new_season") {
    const year = Number(body.year);
    if (!Number.isInteger(year) || year < 2027 || year > 2099) throw new Error("Choose a season year from 2027 onward.");
    const newId = `lakeshore-${year}`;
    await database.prepare("INSERT INTO seasons (id, year, title, status, registration_open) VALUES (?, ?, ?, 'planning', false)").bind(newId, year, `Lakeshore Holiday Spirit Survivor ${year}`).run();
    await recordAdminAction("new_season_created", newId, { year });
    return { ok: true, seasonId: newId };
  }
  throw new Error("Choose a valid organizer action.");
}

async function handleGet(request: Request, path: string) {
  if (path === "health") return json({ ok: true, database: databaseConfigured(), organizerConfigured: Boolean((envVars.ORGANIZER_PASSWORD || (envVars.ORGANIZER_PASSWORD_SALT && envVars.ORGANIZER_PASSWORD_HASH)) && typeof envVars.SESSION_SECRET === "string" && envVars.SESSION_SECRET.length >= 32), season: "2026" });
  if (path === "public") return json(await publicData());
  if (path === "organizer") {
    if (!await isOrganizer(request)) return json({ error: "Sign in to view organizer tools." }, 401);
    return json(await organizerData());
  }
  return json({ error: "Not found." }, 404);
}

async function handlePost(request: Request, path: string) {
  if (!sameOrigin(request)) return json({ error: "This request did not come from this site." }, 403);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ error: "Enter valid form details." }, 400);
  if (path === "register") {
    const season = await getSeason();
    if (!season.registration_open || season.status === "complete") return json({ error: "Registration is currently closed." }, 409);
    if (!await checkRateLimit(request, "staff_registration", 120)) return json({ error: "Too many registration attempts. Try again later or contact the organizer." }, 429);
    const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
    const email = String(body.email ?? "").trim().toLowerCase();
    const count = Number(body.count ?? 1);
    const categories = Array.isArray(body.categories) ? body.categories : [body.category ?? "regular"];
    if (name.length < 2 || name.length > 80) return json({ error: "Enter your first and last name." }, 400);
    if (email.length > 160 || !/^[^\s@]+@cbe\.ab\.ca$/i.test(email)) return json({ error: "Use your CBE email address ending in @cbe.ab.ca." }, 400);
    if (!Number.isInteger(count) || count < 1 || count > 2 || categories.length !== count || categories.some((x) => x !== "regular" && x !== "spirits")) return json({ error: "Choose one or two entries and a valid gift card category for each." }, 400);
    const database = requireDb();
    const existing = await database.prepare("SELECT id, name FROM participants WHERE season_id = ? AND LOWER(email) = LOWER(?)").bind(season.id, email).first<{ id: string; name: string }>();
    if (existing && existing.name.toLowerCase() !== name.toLowerCase()) return json({ error: "That email is already registered under a different name. Contact the organizer to update it." }, 409);
    const participantId = existing?.id ?? id();
    if (!existing) await database.prepare("INSERT OR IGNORE INTO participants (id, season_id, name, email) VALUES (?, ?, ?, ?)").bind(participantId, season.id, name, email).run();
    const participant = await database.prepare("SELECT id, name FROM participants WHERE season_id = ? AND LOWER(email) = LOWER(?)").bind(season.id, email).first<{ id: string; name: string }>();
    if (!participant) return json({ error: "Could not save your registration. Try again." }, 500);
    const occupied = await database.prepare("SELECT entry_number FROM entries WHERE participant_id = ? AND status != 'cancelled'").bind(participant.id).all<{ entry_number: number }>();
    const taken = new Set((occupied.results ?? []).map((x) => x.entry_number));
    const free = [1, 2].filter((n) => !taken.has(n));
    if (free.length < count) return json({ error: `This email already has ${2 - free.length} of the two available entries.` }, 409);
    const statements = categories.map((category, i) => database.prepare("INSERT OR IGNORE INTO entries (id, season_id, participant_id, entry_number, card_type, status, card_value_cents) VALUES (?, ?, ?, ?, ?, 'active', 2500)").bind(id(), season.id, participant.id, free[i], category));
    await database.batch(statements);
    const total = await database.prepare("SELECT COUNT(*) AS n FROM entries WHERE participant_id = ? AND status != 'cancelled'").bind(participant.id).first<{ n: number }>();
    return json({ ok: true, name: participant.name, registeredNow: Math.min(count, free.length), entriesTotal: total?.n ?? 0, message: "You’re on the list. Bring one $25 gift card for each entry to the organizer." }, 201);
  }
  if (path === "organizer/login") {
    if (!await checkRateLimit(request, "organizer_login", 8)) return json({ error: "Too many sign-in attempts. Try again later." }, 429);
    const password = String(body.password ?? "");
    if (!password || !await verifyPassword(password)) return json({ error: "That organizer password doesn’t match." }, 401);
    const token = await lockSession({});
    return json({ ok: true }, 200, { "Set-Cookie": `ls_survivor_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800` });
  }
  if (path === "organizer/logout") return json({ ok: true }, 200, { "Set-Cookie": "ls_survivor_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });
  if (path.startsWith("organizer/")) {
    if (!await isOrganizer(request)) return json({ error: "Sign in to use organizer tools." }, 401);
    if (path === "organizer/action") return json(await action(body));
  }
  return json({ error: "Not found." }, 404);
}

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  try { const p = (await context.params).path ?? []; return await handleGet(request, p.join("/")); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "The request could not be completed." }, 503); }
}

export async function POST(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  try { const p = (await context.params).path ?? []; return await handlePost(request, p.join("/")); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "The request could not be completed." }, 400); }
}
