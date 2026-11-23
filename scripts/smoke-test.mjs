import assert from "node:assert/strict";
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const cwd = process.cwd();
const port = 4327;
const base = `http://127.0.0.1:${port}`;
const password = randomBytes(24).toString("base64url");
const salt = randomBytes(16);
const sessionSecret = randomBytes(48).toString("base64url");
const passwordHash = pbkdf2Sync(password, salt, 310000, 32, "sha256");
const passwordEnv = {
  ...process.env,
  SURVIVOR_TEST: "true",
  SURVIVOR_TEST_DATE: "2026-12-07",
  ORGANIZER_PASSWORD_SALT: salt.toString("base64"),
  ORGANIZER_PASSWORD_HASH: passwordHash.toString("base64"),
  SESSION_SECRET: sessionSecret,
};
let worker;
let output = "";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: passwordEnv, stdio: ["ignore", "pipe", "pipe"], ...options });
    let stdout = ""; let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} failed (${code}).\n${stderr || stdout}`)));
  });
}

async function api(path, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${base}/api/${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload, response };
}

async function waitForWorker() {
  for (let i = 0; i < 45; i++) {
    if (worker.exitCode !== null) throw new Error(`Local worker exited early.\n${output}`);
    try { const response = await fetch(`${base}/api/health`); if (response.ok) return; } catch {}
    await sleep(500);
  }
  throw new Error(`Local worker did not become ready.\n${output}`);
}

async function runProofAudit(data) {
  const seed = Buffer.from(data.season.auditSeedReveal, "hex");
  assert.equal(createHash("sha256").update(data.season.auditSeedReveal, "utf8").digest("hex"), data.season.auditCommit, "seed reveal matches the public commitment");
  const active = new Set(data.entries.map((entry) => entry.id).sort());
  const draws = [...data.eliminations].sort((a, b) => a.draw_number - b.draw_number);
  for (const draw of draws) {
    const candidates = [...active].sort();
    const poolHash = createHash("sha256").update(JSON.stringify(candidates)).digest("hex");
    assert.equal(poolHash, draw.pool_hash, `draw ${draw.draw_number} pool hash`);
    assert.equal(candidates.length, draw.pool_count, `draw ${draw.draw_number} pool count`);
    assert.equal(candidates[draw.selected_index], draw.entry_id, `draw ${draw.draw_number} selected entry`);
    if (draw.draw_method === "hat") {
      assert.equal(draw.random_proof, "", `hat draw ${draw.draw_number} is not mislabeled as a cryptographic random draw`);
      active.delete(draw.entry_id);
      continue;
    }
    const message = `${data.season.id}|${draw.draw_number}|${poolHash}|${draw.random_attempt}`;
    const proof = createHmac("sha256", seed).update(message).digest("hex");
    assert.equal(proof, draw.random_proof, `draw ${draw.draw_number} HMAC proof`);
    const max = 1n << 256n;
    const bound = (max / BigInt(candidates.length)) * BigInt(candidates.length);
    const number = BigInt(`0x${proof}`);
    assert.ok(number < bound, `draw ${draw.draw_number} uses an unbiased proof sample`);
    const selected = Number(number % BigInt(candidates.length));
    assert.equal(selected, draw.selected_index, `draw ${draw.draw_number} selected index`);
    assert.equal(candidates[selected], draw.entry_id, `draw ${draw.draw_number} matches its random proof`);
    active.delete(draw.entry_id);
  }
}

try {
  worker = spawn(process.execPath, ["./node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd, env: passwordEnv, stdio: ["ignore", "pipe", "pipe"] });
  worker.stdout.on("data", (chunk) => { output = (output + chunk.toString()).slice(-4000); });
  worker.stderr.on("data", (chunk) => { output = (output + chunk.toString()).slice(-4000); });
  await waitForWorker();

  const health = await api("health");
  assert.equal(health.payload.organizerConfigured, true, `local organizer secrets are available to Next.js: ${JSON.stringify(health.payload)}`);

  const initial = await api("public");
  assert.equal(initial.status, 200, "public board loads");
  assert.equal(initial.payload.season.year, 2026, "new 2026 season is created empty");
  assert.equal(initial.payload.stats.entries, 0, "season starts with no imported participants");
  const closed = await api("register", { method: "POST", body: { name: "Test Person", email: "test.person@example.test", count: 1, categories: ["regular"] } });
  assert.equal(closed.status, 409, "registration is closed by default");

  const login = await api("organizer/login", { method: "POST", body: { password } });
  assert.equal(login.status, 200, `organizer login accepts the configured password: ${JSON.stringify(login.payload)}`);
  const cookie = login.response.headers.get("set-cookie")?.match(/ls_survivor_session=[^;]+/)?.[0];
  assert.ok(cookie, "organizer login issues a signed session cookie");
  const act = async (action, values = {}) => {
    const result = await api("organizer/action", { method: "POST", body: { action, ...values }, cookie });
    assert.equal(result.status, 200, `${action} succeeds: ${result.payload.error ?? ""}`);
    return result.payload;
  };

  await act("registration", { open: true });
  const invalidDomain = await api("register", { method: "POST", body: { name: "Outside Example", email: "outside@example.test", count: 1, categories: ["regular"] } });
  assert.equal(invalidDomain.status, 400, "registration requires a CBE email address");
  const doubled = await api("register", { method: "POST", body: { name: "Avery Example", email: "avery@cbe.ab.ca", count: 2, categories: ["regular", "spirits"] } });
  assert.equal(doubled.status, 201, `registration supports two entries with per-entry card categories: ${JSON.stringify(doubled.payload)}`);
  for (const [i, name] of ["Blair Example", "Casey Example", "Devon Example", "Emery Example"].entries()) {
    const result = await api("register", { method: "POST", body: { name, email: `staff${i}@cbe.ab.ca`, count: 1, categories: [i % 2 ? "spirits" : "regular"] } });
    assert.equal(result.status, 201, "single entry registration succeeds");
  }
  const overLimit = await api("register", { method: "POST", body: { name: "Avery Example", email: "avery@cbe.ab.ca", count: 1, categories: ["regular"] } });
  assert.equal(overLimit.status, 409, "third entry is blocked");
  const publicEntries = (await api("public")).payload.entries;
  assert.ok(publicEntries.every((entry) => !("email" in entry)), "public standings never expose staff emails");

  const roster = (await api("organizer", { cookie })).payload.entries;
  assert.equal(roster.length, 6, "organizer roster includes all six entries");
  for (const entry of roster) await act("collect", { entryId: entry.id, merchant: "Test Card Shop" });
  await act("registration", { open: false });
  const teams = await act("teams");
  assert.equal(teams.teams.length, 2, "entries are balanced into two teams");
  assert.ok(Math.abs(teams.teams[0].entryCount - teams.teams[1].entryCount) <= 1, `team sizes differ by no more than one: ${JSON.stringify(teams.teams)}`);
  const updatedRoster = (await api("organizer", { cookie })).payload.entries;
  const averyTeams = new Set(updatedRoster.filter((entry) => entry.email === "avery@cbe.ab.ca").map((entry) => entry.teamId));
  assert.equal(averyTeams.size, 2, "a person’s two entries are kept on separate teams");

  const earlySchedule = await api("organizer/action", { method: "POST", body: { action: "schedule_add", date: "2026-12-04", count: 1 }, cookie });
  assert.equal(earlySchedule.status, 400, "2026 draws cannot be scheduled before December 7");
  assert.match(earlySchedule.payload.error, /December 7/, "the schedule enforces the first draw date");
  const weekendSchedule = await api("organizer/action", { method: "POST", body: { action: "schedule_add", date: "2026-12-12", count: 1 }, cookie });
  assert.equal(weekendSchedule.status, 400, "weekend draw dates are rejected");
  assert.match(weekendSchedule.payload.error, /Monday to Friday/, "the schedule explains the weekday rule");
  const lateSchedule = await api("organizer/action", { method: "POST", body: { action: "schedule_add", date: "2026-12-21", count: 1 }, cookie });
  assert.equal(lateSchedule.status, 400, "2026 draws cannot be scheduled after December 18");
  assert.match(lateSchedule.payload.error, /December 18/, "the schedule enforces the final draw date");
  await act("schedule_add", { date: "2026-12-07", count: 10 });
  const commitment = await act("lock_audit");
  assert.match(commitment.commitment, /^[a-f0-9]{64}$/i, "public draw seed commitment is a SHA-256 hash");
  let game = null;
  const firstPool = (await api("public")).payload.entries.filter((entry) => entry.status === "active");
  const invalidHat = await api("organizer/action", { method: "POST", body: { action: "hat_draw", entryId: "not-eligible" }, cookie });
  assert.equal(invalidHat.status, 400, "hat draw rejects entries outside the eligible pool");
  const hatResult = await act("hat_draw", { entryId: firstPool[0].id });
  assert.equal(hatResult.draw.method, "hat", "organizer can record the filmed hat result");
  game = (await api("public")).payload;
  assert.equal(game.eliminations[0].draw_method, "hat", "the public history identifies a hat draw");
  for (let i = 0; i < 9; i++) {
    await act("draw");
    game = (await api("public")).payload;
    if (game.season.status === "complete") break;
  }
  assert.equal(game.season.status, "complete", "the winning team is detected automatically");
  assert.ok(game.season.winnerTeamId, "winning team is stored");
  assert.ok(game.season.auditSeedReveal, "the committed seed is revealed after the season ends");
  await runProofAudit(game);

  await act("auto_distribute");
  const finalRoster = (await api("organizer", { cookie })).payload;
  assert.ok(Array.isArray(finalRoster.winnerMembers), `organizer winner data loads after completion: ${JSON.stringify(finalRoster)}`);
  const memberDistribution = finalRoster.winnerMembers.map((member) => member.distributed_cards);
  assert.equal(memberDistribution.reduce((sum, count) => sum + count, 0), 6, "all cards are assigned to winning team members");
  assert.ok(Math.max(...memberDistribution) - Math.min(...memberDistribution) <= 1, "prize cards are split evenly across the winning team");
  const nextSeason = await act("new_season", { year: 2027 });
  assert.equal(nextSeason.seasonId, "lakeshore-2027", "organizer can create the next season");
  const fresh = (await api("public")).payload;
  assert.equal(fresh.season.year, 2027, "the new season becomes current");
  assert.equal(fresh.stats.entries, 0, "the new season does not copy past participants");
  console.log("PASS: public registration, two-entry cap, privacy, gift-card collection, balanced teams, split-entry rule, weekday schedule, filmed hat-draw recording, cryptographic random draw verification, automatic winner, prize distribution, and blank season rollover.");
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (worker && worker.exitCode === null) { worker.kill("SIGTERM"); await new Promise((resolve) => worker.once("exit", resolve)); }
}
