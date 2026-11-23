"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Candy, CircleHelp, Gift, GlassWater, Ghost, Leaf, PackageOpen, Snowflake, Sparkles, Star, TreePine, type LucideIcon } from "lucide-react";

type Team = { id: string; name: string; survivors: number; total_entries: number };
type Entry = { id: string; name: string; entryNumber: number; category: string; teamId: string | null; teamName: string | null; status: string; eliminated: boolean; email?: string; collectedAt?: string | null; merchant?: string | null; cardValueCents?: number; distributedTo?: string | null; distributedAt?: string | null };
type Draw = { id: string; entry_id: string; draw_number: number; draw_method: "random" | "hat"; pool_count: number; pool_hash: string; random_proof: string; random_attempt: number; selected_index: number; created_at: string; draw_date: string | null; schedule_id: string | null; name: string; entry_number: number; card_type: string; team_name: string };
type Schedule = { id: string; draw_date: string; draws_planned: number };
type Season = { id: string; year: number; title: string; status: string; registrationOpen: boolean; winnerTeamId: string | null; auditCommit: string | null; auditLockedAt: string | null; auditSeedReveal: string | null; drawCount: number };
type Data = { season: Season; stats: { entries: number; survivors: number; eliminated: number; teams: number; collectedCards: number; regularCards: number; spiritsCards: number; prizeValueCents: number }; entries: Entry[]; teams: Team[]; schedule: Schedule[]; eliminations: Draw[]; winnerMembers?: Array<{ name: string; team_entries: number; distributed_cards: number }>; audit: Array<{ action: string; entity_type: string; entity_id: string; details: string; created_at: string }> };

async function requestJson<T = Record<string, any>>(path: string, payload?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, { method: payload ? "POST" : "GET", headers: payload ? { "Content-Type": "application/json" } : undefined, body: payload ? JSON.stringify(payload) : undefined, credentials: "same-origin", cache: "no-store" });
  const result = await response.json().catch(() => ({})) as { error?: string } & Record<string, unknown>;
  if (!response.ok) throw new Error(result.error || "That didn’t work. Try again.");
  return result as T;
}

function money(cents: number) { return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(cents / 100); }
function dateLabel(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString("en-CA", { month: "short", day: "numeric", weekday: "short", timeZone: "America/Edmonton" }); }
function todayEdmonton() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function teamIcon(name: string): LucideIcon {
  const lower = name.toLowerCase();
  if (/grinch|fright|misfit/.test(lower)) return Ghost;
  if (/egg|spirit|regret|nog/.test(lower)) return GlassWater;
  if (/gift|card|present|re-gift/.test(lower)) return Gift;
  if (/jingle|bell/.test(lower)) return Bell;
  if (/wrap|stocking/.test(lower)) return PackageOpen;
  if (/frost|snow|winter|frosty/.test(lower)) return Snowflake;
  if (/mistletoe|wreath|cranberry/.test(lower)) return Leaf;
  if (/naughty|candy|cookie|peppermint|gingerbread/.test(lower)) return Candy;
  if (/sleigh|reindeer|deer/.test(lower)) return Star;
  if (/yule|north pole|tree|holly/.test(lower)) return TreePine;
  if (/merry|jolly|cheer|sparkle|tinsel/.test(lower)) return Sparkles;
  if (/hark|fa la|carol/.test(lower)) return Star;
  return CircleHelp;
}

function TeamEmblem({ name, index }: { name: string; index: number }) {
  const Icon = teamIcon(name);
  return <div className={`team-emblem emblem-${index % 6}`} aria-label={`${name} team emblem`}><Icon size={25} strokeWidth={1.8} aria-hidden="true" /><i aria-hidden="true" /></div>;
}

const demoStaff = [
  "Ian Fero", "Danielle Boutette", "Melissa Hopkins", "Teri Ryan Simmt", "Megan Thul", "Amanda Beazer", "Shayna James",
  "Janice Grover", "Megan Colpitts", "Amy Comfort", "Diana Hamilton", "Jennifer Second-Tomlin", "Phil Lansdown", "Dawn-Lyn Morris", "Corinne Swan", "Jillian Shaw", "Dawn Donohue",
  "Kevin Jozsa", "Elise Brittain", "Patricia Matkowski", "Sherry Shoults", "Jade Wesley", "Peyton Young", "Jessica Shaw", "Katie Edelmann",
  "Natasha Ruzycki", "Hilary Juzwishyn", "Crystal Cooper", "Alison Moller", "Daniel Polsky", "Mike Porter",
  "Emily Schroderus", "David Erickson", "Kenny Apperley", "Kori Ballantine", "Jana Cameron", "Tara Gordon-Cooper", "Candace McGovern", "Karlynn Peltier", "Elissa Charney", "Karolina Pater",
  "Ashley Clark", "Kristi Barva", "Brandon Clowes", "Erin Richards", "Paige Appelhof", "Josh Kay", "Allen Wideman", "Dustyn Richardson",
  "Amina Haroon", "Kari Zurbriggen", "Bobbie-Jo Edison", "Tracey Sheppard", "Lana Trystruha", "Holly Herman", "Kristin Kubik", "Julie Bailey", "Christine Thomson-Schaefer", "Allison Laursen", "Kirsty Haynes-Wood", "Kaya Vesilic", "Joe Lanteigne", "Fenalix Penaga", "Elisa Pagsanghan", "Abby Munoz",
];

function makeDemoData(): Data {
  const teamNames = ["Grinches With Benefits", "Eggnog & Regret", "The Gift Cardigans", "Yule Be Sorry", "The Re-Gifters", "Jingle Bell Rock Bottom", "The Merry Misfits", "The Wrap Battle", "The Hark Side", "Frosty Bottoms", "The Sleigh Allstars", "Mistletoe Mayhem", "The Naughty List Alumni"];
  const teamCount = Math.ceil(demoStaff.length / 5);
  const teams: Team[] = teamNames.slice(0, teamCount).map((name, id) => ({ id: `demo-team-${id + 1}`, name, survivors: 0, total_entries: 0 }));
  const entries: Entry[] = demoStaff.map((name, index) => {
    const teamIndex = index % teamCount;
    const team = teams[teamIndex];
    const eliminated = index < 5;
    team.total_entries++;
    if (!eliminated) team.survivors++;
    return { id: `demo-entry-${index + 1}`, name, entryNumber: 1, category: index % 2 ? "spirits" : "regular", teamId: team.id, teamName: team.name, status: eliminated ? "eliminated" : "active", eliminated, email: `demo-${index + 1}@example.invalid`, collectedAt: "2026-11-23T16:00:00.000Z", merchant: index % 2 ? "Demo Spirits Shop" : "Demo Gift Cards", cardValueCents: 2500 };
  });
  const demoDate = (day: number) => `2026-12-${String(day).padStart(2, "0")}`;
  const demoDrawDays = [7, 8, 9];
  const eliminations: Draw[] = entries.slice(0, 5).map((entry, index) => ({
    id: `demo-draw-${index + 1}`, entry_id: entry.id, draw_number: index + 1, draw_method: "random", pool_count: demoStaff.length - index,
    pool_hash: `DEMO${String(index + 1).padStart(4, "0")}${"a".repeat(56)}`, random_proof: `DEMO${String(index + 1).padStart(4, "0")}${"b".repeat(56)}`,
    random_attempt: 0, selected_index: index + 2, created_at: `${demoDate(demoDrawDays[Math.floor(index / 2)])}T18:00:00.000Z`,
    draw_date: demoDate(demoDrawDays[Math.floor(index / 2)]), schedule_id: `demo-schedule-${demoDrawDays[Math.floor(index / 2)]}`,
    name: entry.name, entry_number: 1, card_type: entry.category, team_name: entry.teamName ?? "",
  }));
  const schedule: Schedule[] = [7, 8, 9, 10, 11, 14, 15, 16, 17, 18].map((day, index) => ({ id: `demo-schedule-${day}`, draw_date: demoDate(day), draws_planned: [6, 6, 6, 6, 6, 6, 6, 6, 6, 5][index] }));
  const spiritsCards = Math.floor(demoStaff.length / 2);
  return {
    season: { id: "demo-2026", year: 2026, title: "Lakeshore Holiday Spirit Survivor 2026 · DEMO", status: "active", registrationOpen: false, winnerTeamId: null, auditCommit: "DEMO ONLY · not a real draw commitment", auditLockedAt: "2026-11-23T16:00:00.000Z", auditSeedReveal: null, drawCount: 5 },
    stats: { entries: demoStaff.length, survivors: demoStaff.length - 5, eliminated: 5, teams: teams.length, collectedCards: demoStaff.length, regularCards: demoStaff.length - spiritsCards, spiritsCards, prizeValueCents: demoStaff.length * 2500 },
    entries, teams, schedule, eliminations: [...eliminations].reverse(), audit: [],
  };
}

async function renderSharePoster(data: Data): Promise<Blob> {
  const alive = data.entries.filter((entry) => entry.status === "active");
  const groups = data.teams.map((team) => ({ team, members: data.entries.filter((entry) => entry.teamId === team.id).sort((a, b) => Number(a.status !== "active") - Number(b.status !== "active") || a.name.localeCompare(b.name) || a.entryNumber - b.entryNumber) })).filter((group) => group.members.length);
  const cardHeights = groups.map(({ members }) => 68 + members.length * 27 + 12);
  const columnHeights = [0, 0]; cardHeights.forEach((height, index) => { columnHeights[index % 2] += height; });
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = Math.max(2300, 790 + Math.max(...columnHeights, 0) + 150);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create the poster image.");
  const W = canvas.width, H = canvas.height;
  const background = ctx.createLinearGradient(0, 0, W, H);
  background.addColorStop(0, "#0d2d2b"); background.addColorStop(1, "#173d38");
  ctx.fillStyle = background; ctx.fillRect(0, 0, W, H);
  const roundRect = (x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) => {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  };
  const text = (value: string, x: number, y: number, font: string, color: string, maxWidth?: number) => {
    ctx.font = font; ctx.fillStyle = color; ctx.fillText(value, x, y, maxWidth);
  };
  const currentOrDrawDate = data.eliminations[0]?.created_at ?? new Date().toISOString();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(currentOrDrawDate));
  const eliminated = data.entries.length - alive.length;
  const activeTeams = data.teams.filter((team) => team.survivors > 0);
  const demo = data.season.id === "demo-2026";

  // Festive corner ornaments and header.
  ctx.globalAlpha = .14; ctx.strokeStyle = "#00deee"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(1010, 80, 190, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "#dbb65d"; ctx.beginPath(); ctx.arc(80, 2250, 230, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  text("LAKESHORE BEARS  ·  HOLIDAY SPIRIT SURVIVOR", 62, 78, "700 18px Arial", "#dfc77f");
  if (demo) { roundRect(770, 42, 245, 44, 22, "#c34550"); text("SAMPLE DATA · NOT REAL", 790, 71, "700 14px Arial", "#fff8e8"); }
  text("DAILY GAME UPDATE", 62, 162, "700 15px Arial", "#8dd5d2");
  text("WHO'S STILL STANDING?", 62, 245, "500 64px Georgia", "#fff9e9", 950);
  text(date.toUpperCase(), 64, 288, "700 17px Arial", "#b7c9bd");

  const metrics = [
    [String(alive.length), "ENTRIES ALIVE"],
    [String(eliminated), "ELIMINATED"],
    [String(activeTeams.length), "TEAMS STILL IN"],
    [money(data.stats.prizeValueCents), "CONFIRMED POT"],
  ];
  const metricY = 325, metricGap = 15, metricWidth = (W - 124 - metricGap * 3) / 4;
  metrics.forEach(([value, label], index) => {
    const x = 62 + index * (metricWidth + metricGap);
    roundRect(x, metricY, metricWidth, 126, 16, "#f7f3e5");
    text(value, x + 18, metricY + 57, "500 42px Georgia", "#153d39", metricWidth - 36);
    text(label, x + 18, metricY + 94, "700 13px Arial", "#69766e", metricWidth - 30);
  });

  const latest = data.eliminations[0];
  roundRect(62, 480, 956, 164, 18, "#c34550");
  text(latest ? "MOST RECENTLY ELIMINATED" : "THE GAME IS READY", 90, 523, "700 14px Arial", "#ffe2b7");
  text(latest ? latest.name : "No one has been eliminated yet.", 90, 574, latest ? "500 38px Georgia" : "500 30px Georgia", "#fff9e9", 890);
  text(latest ? `${latest.team_name}   ·   Entry ${latest.entry_number}` : `${alive.length} entries are still in the game.`, 90, 615, "600 17px Arial", "#f8dfe0", 890);

  text("THE FULL ROSTER", 62, 710, "700 16px Arial", "#dfc77f");
  text("Every entry, alive or eliminated", 62, 752, "500 31px Georgia", "#fff9e9");
  const columnX = [62, 550], cardW = 468, cardGap = 12, colY = [790, 790];
  groups.forEach(({ team, members }, index) => {
    const column = index % 2, x = columnX[column], y = colY[column];
    const cardH = 68 + members.length * 27;
    const aliveCount = members.filter((entry) => entry.status === "active").length;
    const outCount = members.length - aliveCount;
    roundRect(x, y, cardW, cardH, 14, "#f7f3e5");
    text(team.name, x + 18, y + 31, "700 17px Arial", "#153d39", cardW - 130);
    text(`${aliveCount} IN  ·  ${outCount} OUT`, x + cardW - 126, y + 31, "700 10px Arial", outCount ? "#a43c46" : "#438576", 108);
    ctx.strokeStyle = "#e2e0d5"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 18, y + 43); ctx.lineTo(x + cardW - 18, y + 43); ctx.stroke();
    members.forEach((entry, memberIndex) => {
      const rowY = y + 68 + memberIndex * 27;
      const isOut = entry.status !== "active";
      ctx.fillStyle = isOut ? "#c34550" : "#dbb65d"; ctx.beginPath(); ctx.arc(x + 23, rowY - 5, 4, 0, Math.PI * 2); ctx.fill();
      const label = `${entry.name}  ·  Entry ${entry.entryNumber}`;
      const maxWidth = isOut ? cardW - 150 : cardW - 56;
      ctx.font = "500 16px Arial";
      const measuredWidth = Math.min(ctx.measureText(label).width, maxWidth);
      text(label, x + 37, rowY, "500 16px Arial", isOut ? "#858b85" : "#384943", maxWidth);
      if (isOut) {
        ctx.strokeStyle = "#c34550"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 37, rowY - 5); ctx.lineTo(x + 37 + measuredWidth, rowY - 5); ctx.stroke();
        roundRect(x + cardW - 66, rowY - 17, 42, 22, 11, "#fae7e8", "#f1cdd0");
        text("OUT", x + cardW - 57, rowY - 2, "800 10px Arial", "#a43c46", 28);
      }
    });
    colY[column] += cardH + cardGap;
  });
  const footerY = Math.min(H - 55, Math.max(colY[0], colY[1]) + 8);
  ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.beginPath(); ctx.moveTo(62, footerY - 28); ctx.lineTo(W - 62, footerY - 28); ctx.stroke();
  text("FULL LIVE STANDINGS", 62, footerY, "700 14px Arial", "#8dd5d2");
  text(window.location.host, W - 62, footerY, "600 14px Arial", "#fff9e9");
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not export the poster image.")), "image/png"));
}

export default function Home() {
  const [data, setData] = useState<Data | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("home");
  const [entryCount, setEntryCount] = useState(1);
  const [categories, setCategories] = useState(["regular", "regular"]);
  const [registerMessage, setRegisterMessage] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [registering, setRegistering] = useState(false);
  const [reveal, setReveal] = useState<Draw | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const latestSeen = useRef<string | null>(null);
  useEffect(() => { setDemoMode(new URLSearchParams(window.location.search).get("demo") === "1"); }, []);
  const refresh = useCallback(async () => { try { const useDemoData = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1"; const next = useDemoData ? makeDemoData() : await requestJson<Data>("public"); setData(next); } catch { /* The status panel below gives a retry path. */ } finally { setLoading(false); } }, []);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 12000); return () => window.clearInterval(timer); }, [refresh]);
  useEffect(() => {
    const latest = data?.eliminations?.[0];
    if (!latest) return;
    if (latestSeen.current === null) { latestSeen.current = latest.id; return; }
    if (latestSeen.current !== latest.id) { latestSeen.current = latest.id; setReveal(latest); setIsRevealing(true); window.setTimeout(() => setIsRevealing(false), 3600); }
  }, [data?.eliminations]);

  const survivors = useMemo(() => (data?.entries ?? []).filter((entry) => entry.status === "active"), [data]);
  const winner = data?.teams.find((team) => team.id === data.season.winnerTeamId);

  async function submitRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setRegisterError(""); setRegisterMessage(""); setRegistering(true);
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    try {
      const result = await requestJson("register", { name: form.get("name"), email: form.get("email"), count: entryCount, categories: categories.slice(0, entryCount) });
      setRegisterMessage(result.message); formElement.reset(); setEntryCount(1); await refresh();
    } catch (error) { setRegisterError(error instanceof Error ? error.message : "Could not save your entry."); }
    finally { setRegistering(false); }
  }

  function go(next: string) { setPage(next); window.scrollTo({ top: 0, behavior: "smooth" }); }

  if (page === "organizer") return <Organizer onClose={() => go("home")} onChanged={refresh} />;

  return <main className="site-shell">
    <header className="topbar">
      <a className="brand" href="#top" onClick={() => go("home")} aria-label="Lakeshore Holiday Spirit Survivor home">
        <span className="brand-mark"><span>LH</span><i /></span><span className="brand-copy"><b>LAKESHORE</b><small>HOLIDAY SPIRIT SURVIVOR</small></span>
      </a>
      <nav className="main-nav" aria-label="Main navigation">
        {[["home", "Live game"], ["teams", "Teams"], ["history", "Draw history"], ["prizes", "Prize pot"], ["rules", "How to play"]].map(([id, label]) => <button className={page === id ? "nav-link active" : "nav-link"} key={id} onClick={() => go(id)}>{label}</button>)}
      </nav>
      <button className="organizer-link" onClick={() => demoMode ? window.location.assign("/") : go("organizer")}><span className="lock-icon">⌑</span><span>{demoMode ? "Exit demo" : "Organizer"}</span></button>
    </header>

    {demoMode && <div className="demo-banner"><b>DEMO VIEW</b><span>65 sample staff entries · 5 sample eliminations · no real registrations or draw results</span><a href="/">Back to live 2026 season</a></div>}

    {page === "home" && <>
      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="live-pulse" /> THE {data?.season.year ?? 2026} STAFF GAME <span className="eyebrow-divider">·</span> LAKESHORE SCHOOL</div>
          <h1>Good cheer.<br /><em>Bad odds.</em></h1>
          <p className="hero-lede">A little holiday spirit goes a long way. Until the daily draw says otherwise.</p>
          <div className="hero-actions">
            {data?.season?.registrationOpen ? <a className="button button-primary" href="#register">Enter the game <span className="button-sparkle">✦</span></a> : <span className="button button-disabled">Registration is closed</span>}
            <button className="button button-outline" onClick={() => go("rules")}>How it works</button>
          </div>
          <div className="micro-note"><span className="mini-star">✦</span> One $25 card. One very questionable survival strategy.</div>
        </div>
        <div className="hero-art" aria-label="Festive holiday survivor game illustration">
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <div className="art-snow s1">✳</div><div className="art-snow s2">✦</div><div className="art-snow s3">✳</div><div className="art-snow s4">✦</div>
          <div className="hero-gift gift-large"><div className="gift-bow" /><div className="gift-ribbon" /><div className="gift-tag">STAY<br />JOLLY</div></div>
          <div className="hero-gift gift-small"><div className="gift-bow" /><div className="gift-ribbon" /></div>
          <div className="hero-card"><div className="card-top"><span>OFFICIAL SURVIVAL STATUS</span><span className="tiny-light" /></div><strong>STILL<br /><i>IN IT.</i></strong><div className="card-bottom"><span>DEC 2026</span><span>✦ <span className="teal-text">LS</span></span></div></div>
          <div className="sparkle sparkle-a">✦</div><div className="sparkle sparkle-b">✦</div>
        </div>
        <div className="hero-bottom"><span>LAKESHORE BEARS</span><span className="hero-bottom-rule" /><span>THIS IS BEAR COUNTRY</span></div>
      </section>

      <section className="stats-grid" aria-label="Live season totals">
        <Stat value={String(data?.stats.entries ?? 0)} label="Entries in play" detail="Each entry is its own chance" icon="✦" />
        <Stat value={String(data?.stats.survivors ?? 0)} label="Still surviving" detail="May their luck hold" icon="♧" />
        <Stat value={String(data?.stats.teams ?? 0)} label="Teams" detail="Auto-balanced. Names not so serious." icon="✧" />
        <Stat value={money(data?.stats.prizeValueCents ?? 0)} label="Gift cards collected" detail={`${data?.stats.collectedCards ?? 0} cards confirmed`} icon="$" />
      </section>

      {winner && <section className="winner-banner"><span className="winner-cup">✦</span><div><small>THE LAST TEAM STANDING</small><h2>{winner.name}</h2><p>They outlasted the draw. The gift cards are theirs.</p></div><span className="winner-stamp">{data?.season.year}<br />CHAMPS</span></section>}

      {isRevealing && reveal && <div className="reveal-overlay" role="dialog" aria-modal="true" aria-labelledby="reveal-title">
        <div className="reveal-snow">✳　✦　✳</div><button className="reveal-close" onClick={() => setIsRevealing(false)} aria-label="Close reveal">×</button>
        <div className="reveal-kicker">THE DAILY DRAW HAS SPOKEN</div><h2 id="reveal-title" className="reveal-headline">A name has hit<br /><em>the naughty list.</em></h2>
        <div className="reveal-result"><span className="reveal-number">#{String(reveal.draw_number).padStart(2, "0")}</span><div><b>{reveal.name}</b><small>{reveal.team_name} <span>·</span> Entry {reveal.entry_number}</small></div><span className="reveal-stamp">OUT</span></div>
        <p className="reveal-signoff">The rest of you may resume your festive denial.</p>
      </div>}

      <section className="content-section live-layout">
        <div className="section-heading"><div><div className="eyebrow dark-eyebrow">THE LIVE GAME</div><h2>Who’s still <em>standing?</em></h2></div><div className="share-actions"><button className="text-button" onClick={() => void refresh()}>Refresh standings</button></div></div>
        {loading && !data ? <div className="empty-card"><span className="loader" />Loading live standings…</div> : !data ? <div className="empty-card"><b>The live board isn’t connected yet.</b><p>Try refreshing in a moment.</p><button className="text-button" onClick={() => void refresh()}>Retry connection</button></div> : <>
          <div className="game-panels">
            <div className="panel featured-panel"><div className="panel-heading"><div><span className="panel-kicker">THE SURVIVORS</span><h3>Still in the game</h3></div><span className="count-pill">{survivors.length} entries</span></div>
              {survivors.length ? <div className="survivor-list">{survivors.slice(0, 7).map((entry) => <div className="survivor-row" key={entry.id}><span className="bear-dot">{entry.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span><span className="survivor-name">{entry.name}<small>{entry.teamName ?? "Team assignments pending"}</small></span><span className="entry-pill">ENTRY {entry.entryNumber}</span><span className="survivor-spark">✦</span></div>)}{survivors.length > 7 && <button className="list-more" onClick={() => go("teams")}>See all {survivors.length} survivors</button>}</div> : <div className="panel-empty"><span>☃</span><b>The game is waiting for its first survivors.</b><small>Team assignments and live standings appear here once the organizer starts the season.</small></div>}
            </div>
            <div className="panel schedule-panel"><div className="panel-heading"><div><span className="panel-kicker">THE SCHEDULE</span><h3>Draw dates</h3></div><span className="calendar-icon">▦</span></div>
              {data.schedule.length ? <div className="schedule-list">{data.schedule.slice(0, 7).map((item) => { const drawn = data.eliminations.filter((e) => e.draw_date === item.draw_date).length; return <div className="schedule-row" key={item.id}><div className="schedule-date"><b>{new Date(`${item.draw_date}T12:00:00`).toLocaleDateString("en-CA", { day: "2-digit", timeZone: "America/Edmonton" })}</b><small>{new Date(`${item.draw_date}T12:00:00`).toLocaleDateString("en-CA", { month: "short", weekday: "short", timeZone: "America/Edmonton" })}</small></div><div className="schedule-info"><b>{drawn ? `${drawn} of ${item.draws_planned} drawn` : `${item.draws_planned} ${item.draws_planned === 1 ? "name" : "names"} to be drawn`}</b><small>{drawn ? "The list got a little shorter." : "May the odds be mildly festive."}</small></div><span className={drawn ? "schedule-status done" : "schedule-status"}>{drawn ? "DONE" : "UPCOMING"}</span></div>; })}</div> : <div className="panel-empty compact"><span>◷</span><b>No draw dates posted yet.</b><small>The organizer is setting the schedule.</small></div>}
              <div className="schedule-footnote"><span>✦</span> The name comes from the filmed hat draw, then gets recorded for review.</div>
            </div>
          </div>
      <div className="last-draw-bar"><span className="last-draw-icon">✳</span><div><small>LAST NAME DRAWN</small><b>{data.eliminations[0] ? `${data.eliminations[0].name} has been eliminated` : "No one’s been sent home. Yet."}</b></div>{data.eliminations[0] && <span className="last-draw-team">{data.eliminations[0].team_name}</span>}</div>
        </>}
      </section>

      {data?.season.registrationOpen && <section className="registration-section" id="register">
        <div className="registration-copy"><div className="eyebrow">SIGN YOURSELF UP</div><h2>Take your chances.<br /><em>Bring a gift card.</em></h2><p>Choose one or two $25 entries. Each entry gets its own team, its own shot, and its own date with the draw.</p><div className="registration-note"><span>✦</span><span><b>One person, two entries?</b><br />They’re automatically placed on separate teams.</span></div></div>
        <form className="registration-form" onSubmit={submitRegistration}>
          <div className="form-title"><span>{data?.season.year ?? 2026} ENTRY FORM</span><span className="form-badge">OPEN</span></div>
          <label>First and last name<input name="name" autoComplete="name" maxLength={80} placeholder="e.g. Sam Holiday" required /></label>
          <label>CBE email<input type="email" name="email" autoComplete="email" maxLength={160} pattern=".+@[cC][bB][eE][.][aA][bB][.][cC][aA]" title="Use your CBE email ending in @cbe.ab.ca" placeholder="name@cbe.ab.ca" required /><small>Use your CBE @cbe.ab.ca address.</small></label>
          <fieldset className="entry-choice"><legend>How many entries?</legend><div className="choice-row">{[1, 2].map((n) => <button type="button" key={n} className={entryCount === n ? "choice active" : "choice"} onClick={() => setEntryCount(n)}><span className="choice-radio" />{n} {n === 1 ? "entry" : "entries"}<small>{n * 25} dollars in gift cards</small></button>)}</div></fieldset>
          <div className="category-fields">{Array.from({ length: entryCount }, (_, i) => <label key={i}>Entry {i + 1} gift card type<select value={categories[i]} onChange={(e) => setCategories((previous) => { const next = [...previous]; next[i] = e.target.value; return next; })}><option value="regular">Regular gift card</option><option value="spirits">Spirits gift card</option></select></label>)}</div>
          {registerError && <div className="form-error" role="alert">{registerError}</div>}{registerMessage && <div className="form-success" role="status">{registerMessage}</div>}
          <button className="button button-primary submit-button" type="submit" disabled={registering}>{registering ? "Saving your entry…" : "Count me in"}<span className="button-sparkle">✦</span></button>
          <small className="privacy-note">Your email links your entries and enforces the two-entry limit. Only the organizer can see it; it never appears on public standings, and the site won’t send you email.</small>
        </form>
      </section>}

      <section className="closing-strip"><span className="strip-star">✦</span><p>One team makes it to the end.<br /><em>Everyone else gets a story for the staff room.</em></p><span className="strip-wordmark">THIS IS<br /><b>BEAR COUNTRY.</b></span></section>
    </>}

    {page === "teams" && <ContentPage eyebrow="THE LINEUP" title={<>Pick a side.<br /><em>Get attached.</em></>} description="Balanced teams, random entry assignments, and one very silly name apiece." data={data}>
      {data?.teams.length ? <div className="team-grid">{data.teams.map((team, index) => <div className="team-card" key={team.id}><TeamEmblem name={team.name} index={index} /><div className="team-card-top"><span>TEAM {String(index + 1).padStart(2, "0")}</span><span>{team.survivors} STILL IN</span></div><h3>{team.name}</h3><div className="team-progress"><span style={{ width: `${team.total_entries ? (team.survivors / team.total_entries) * 100 : 0}%` }} /></div><small>{team.survivors} of {team.total_entries} entries alive</small><div className="team-members">{data.entries.filter((entry) => entry.teamId === team.id).map((entry) => <span className={entry.status === "eliminated" ? "team-member eliminated-member" : "team-member"} key={entry.id}><span className="team-member-label">{entry.name} <b>#{entry.entryNumber}</b></span>{entry.status === "eliminated" && <em className="eliminated-badge">OUT</em>}</span>)}</div></div>)}</div> : <div className="empty-card large-empty"><span className="empty-ornament">✳</span><h3>Teams will appear when registration closes.</h3><p>The organizer confirms the $25 cards, then the platform balances entries and gives every team a personality.</p></div>}
    </ContentPage>}

    {page === "history" && <ContentPage eyebrow="THE NAUGHTY LIST" title={<>The draw<br /><em>doesn’t forget.</em></>} description="Each elimination records who was eligible, who was drawn, when it happened, and whether it was a filmed hat draw or a cryptographic random draw." data={data}>
      {data?.eliminations.length ? <div className="history-list">{data.eliminations.map((draw) => <details className="history-row" key={draw.id}><summary><span className="history-no">#{String(draw.draw_number).padStart(2, "0")}</span><span className="history-person"><b>{draw.name}</b><small>{draw.team_name} · Entry {draw.entry_number} · {draw.draw_method === "hat" ? "Filmed hat draw" : "Cryptographic random draw"}</small></span><span className="history-pool">Pool: {draw.pool_count}</span><span className="history-date">{new Date(draw.created_at).toLocaleString("en-CA", { timeZone: "America/Edmonton", dateStyle: "medium", timeStyle: "short" })}</span><span className="expand-mark">+</span></summary><div className="proof-details"><div><small>Eligible pool hash</small><code>{draw.pool_hash}</code></div>{draw.draw_method === "random" ? <div><small>HMAC random proof</small><code>{draw.random_proof}</code></div> : <div><small>Draw record</small><code>Hat draw · selected in person and recorded by organizer</code></div>}<div><small>Selected entry</small><code>{draw.entry_id}</code></div><div><small>Selected index</small><code>{draw.selected_index + 1} <span>of {draw.pool_count}</span></code></div></div></details>)}</div> : <div className="empty-card large-empty"><span className="empty-ornament">✧</span><h3>The draw history is still a blank slate.</h3><p>When the first daily elimination happens, its full audit record will show up here.</p></div>}
      {data?.season.auditCommit && <div className="audit-card"><div><span className="panel-kicker">PUBLIC DRAW COMMITMENT</span><h3>Locked before the first name came out.</h3><p>At season end, the seed is revealed and every result can be reproduced from the published pool hashes and proofs.</p></div><code>{data.season.auditCommit}</code></div>}
      {data?.season.auditSeedReveal && <div className="audit-card reveal-seed"><div><span className="panel-kicker">SEASON SEED REVEALED</span><h3>Verify the draw sequence.</h3><p>This is the seed committed before the first draw.</p></div><code>{data.season.auditSeedReveal}</code></div>}
    </ContentPage>}

    {page === "prizes" && <ContentPage eyebrow="THE POT" title={<>A very merry<br /><em>gift-card haul.</em></>} description="Every confirmed $25 gift card is recorded. The winning team gets the pot; the organizer records who receives each card." data={data}>
      <div className="prize-overview"><div className="prize-total"><small>CONFIRMED POT</small><strong>{money(data?.stats.prizeValueCents ?? 0)}</strong><span>{data?.stats.collectedCards ?? 0} gift cards checked in</span></div><div className="prize-breakdown"><div><span className="prize-icon regular-icon">▣</span><span><b>Regular gift cards</b><small>Tracked by retailer in organizer dashboard</small></span><strong>{data?.stats.regularCards ?? 0}</strong></div><div><span className="prize-icon spirit-icon">✧</span><span><b>Spirits gift cards</b><small>Tracked separately for easy sorting</small></span><strong>{data?.stats.spiritsCards ?? 0}</strong></div></div></div>
      <div className="prize-note"><span>✦</span><p>{winner ? <><b>{winner.name}</b> is the winning team. The organizer is recording gift-card distribution.</> : "The winner gets revealed when only one team has entries left. No spreadsheets, no suspenseful math at the last minute."}</p></div>
    </ContentPage>}

    {page === "rules" && <ContentPage eyebrow="HOW TO PLAY" title={<>Easy to enter.<br /><em>Hard to survive.</em></>} description="The rules in plain language. The daily draw does the hard part." data={data}>
      <div className="rules-grid">{[
        ["01", "Choose your entry", "Staff can register one or two entries. Each entry needs one $25 gift card. Choose a regular gift card or a spirits gift card for each."],
        ["02", "Bring the card", "The organizer confirms each card in the dashboard. Once every entry has been checked in, the platform builds balanced teams."],
        ["03", "Your entries split up", "Two entries from the same person are always assigned to different teams. Each entry is tracked separately throughout the game."],
        ["04", "The hat picks one", "On scheduled dates, the filmed hat draw eliminates one active entry. The eligible pool and selected entry are recorded in the public history."],
        ["05", "Last team wins", "As soon as only one team has active entries left, that team wins the collected gift-card pot. The organizer records every card’s recipient."],
        ["06", "Start fresh next year", "The organizer can create a new season without carrying over old participants, team assignments, or draw history."],
      ].map(([number, title, body]) => <article className="rule-card" key={number}><span className="rule-number">{number}</span><div><h3>{title}</h3><p>{body}</p></div></article>)}</div>
    </ContentPage>}

    <footer className="footer"><a className="footer-brand" href="#top" onClick={() => go("home")}>LAKESHORE <span>BEARS</span></a><span>{data?.season.year ?? 2026} HOLIDAY SPIRIT SURVIVOR</span><button onClick={() => demoMode ? window.location.assign("/") : go("organizer")}>{demoMode ? "Exit demo" : "Organizer dashboard"}</button></footer>
  </main>;
}

function Stat({ value, label, detail, icon }: { value: string; label: string; detail: string; icon: string }) {
  return <article className="stat-card"><span className="stat-icon">{icon}</span><b>{value}</b><span className="stat-label">{label}</span><small>{detail}</small></article>;
}

function ContentPage({ eyebrow, title, description, children, data }: { eyebrow: string; title: React.ReactNode; description: string; children: React.ReactNode; data: Data | null }) {
  return <main className="content-page"><section className="page-intro"><div><div className="eyebrow dark-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><div className="page-snapshot"><small>{data?.season.year ?? 2026} SEASON</small><div><b>{data?.stats.survivors ?? 0}</b><span>surviving entries</span></div><div><b>{data?.stats.teams ?? 0}</b><span>teams in play</span></div></div></section><section className="page-content">{children}</section></main>;
}

function Organizer({ onClose, onChanged }: { onClose: () => void; onChanged: () => Promise<void> }) {
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [scheduleDate, setScheduleDate] = useState("2026-12-07");
  const [scheduleCount, setScheduleCount] = useState(1);
  const [hatEntryId, setHatEntryId] = useState("");
  const [year, setYear] = useState(2027);
  const [merchantDrafts, setMerchantDrafts] = useState<Record<string, string>>({});
  const [distributionDrafts, setDistributionDrafts] = useState<Record<string, string>>({});
  const [posterUrl, setPosterUrl] = useState("");
  const [posterBlob, setPosterBlob] = useState<Blob | null>(null);
  const [posterError, setPosterError] = useState("");
  const [lastDraw, setLastDraw] = useState<{ name: string; teamName: string; entryNumber: number; method: "random" | "hat" } | null>(null);
  const [showDraw, setShowDraw] = useState(false);
  const loginRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => { try { const next = await requestJson<Data>("organizer"); setData(next); setSignedIn(true); } catch { setSignedIn(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (data?.season.year) setScheduleDate(`${data.season.year}-12-10`); }, [data?.season.year]);
  useEffect(() => () => { if (posterUrl) URL.revokeObjectURL(posterUrl); }, [posterUrl]);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { await requestJson("organizer/login", { password: loginRef.current?.value }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not sign in."); }
    finally { setBusy(false); }
  }

  async function act(action: string, values: Record<string, unknown> = {}) {
    setBusy(true); setError(""); setMessage("");
    try { const result = await requestJson("organizer/action", { action, ...values }); await load(); await onChanged(); if (action === "draw" || action === "hat_draw") { setLastDraw(result.draw); setShowDraw(true); window.setTimeout(() => setShowDraw(false), 4200); } else setMessage("Saved. The live board is up to date."); return result; }
    catch (err) { setError(err instanceof Error ? err.message : "That action could not be completed."); }
    finally { setBusy(false); }
  }

  async function logout() { await requestJson("organizer/logout", {}).catch(() => null); setSignedIn(false); setData(null); }

  async function createPoster() {
    if (!data) return;
    setPosterError("");
    try { const blob = await renderSharePoster(data); setPosterBlob(blob); setPosterUrl(URL.createObjectURL(blob)); }
    catch (err) { setPosterError(err instanceof Error ? err.message : "Could not create the share image."); }
  }

  function downloadPoster() {
    if (!posterBlob) return;
    const link = document.createElement("a"); link.href = URL.createObjectURL(posterBlob); link.download = `lakeshore-survivor-${data?.season.year ?? 2026}-daily-update.png`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function sharePoster() {
    if (!posterBlob) return;
    const file = new File([posterBlob], `lakeshore-survivor-${data?.season.year ?? 2026}-daily-update.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "Lakeshore Holiday Spirit Survivor update", text: "Today's survivors and latest elimination." });
    else downloadPoster();
  }

  const today = todayEdmonton();
    const scheduleMinDate = data?.season.year === 2026 ? "2026-12-07" : `${data?.season.year ?? 2026}-01-01`;
    const scheduleMaxDate = data?.season.year === 2026 ? "2026-12-18" : `${data?.season.year ?? 2026}-12-31`;
  const todaySchedule = data?.schedule.find((item) => item.draw_date === today);
  const todayDrawCount = data?.eliminations.filter((item) => item.draw_date === today).length ?? 0;
  const allCollected = Boolean(data?.entries.length && data.entries.every((entry) => entry.collectedAt));
  const seasonReady = Boolean(data?.teams.length);
  const winner = data?.teams.find((team) => team.id === data.season.winnerTeamId);

  return <main className="admin-shell">
    <header className="admin-topbar"><button className="back-link" onClick={onClose}><span>Back to live game</span></button><a className="brand" href="#top"><span className="brand-mark"><span>LH</span><i /></span><span className="brand-copy"><b>LAKESHORE</b><small>SURVIVOR ORGANIZER</small></span></a><span className="admin-state">{signedIn ? "PRIVATE DASHBOARD" : "SECURE ORGANIZER ACCESS"}</span></header>
    {!signedIn ? <section className="login-wrap"><div className="login-art"><span>✦</span><div className="eyebrow">A VERY IMPORTANT HOLIDAY DUTY</div><h1>Keep the game<br /><em>above board.</em></h1><p>Sign in to confirm cards, set the schedule, balance teams, and run each fair, auditable draw.</p><div className="login-footer">LAKESHORE HOLIDAY SPIRIT SURVIVOR <b>·</b> 2026</div></div><form className="login-card" onSubmit={login}><span className="login-lock">⌑</span><small>ORGANIZER DASHBOARD</small><h2>Welcome back.</h2><p>Enter the organizer password to continue.</p><label>Password<input ref={loginRef} type="password" autoComplete="current-password" required /></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="button button-primary" disabled={busy}>{busy ? "Checking…" : "Unlock dashboard"}</button><span className="login-security">Protected with a signed, expiring session.</span></form></section> : <>
      <section className="admin-heading"><div><div className="eyebrow dark-eyebrow">SEASON CONTROL ROOM</div><h1>Make merry.<br /><em>Keep receipts.</em></h1><p>One place for staff entries, gift cards, teams, draws, and the prize pot.</p></div><div className="admin-season"><small>ACTIVE SEASON</small><b>{data?.season.title ?? "Lakeshore Holiday Spirit Survivor 2026"}</b><span className={`season-badge ${data?.season.status ?? ""}`}>{data?.season.status ?? "loading"}</span></div></section>
      <section className="admin-stats">{[
        [String(data?.stats.entries ?? 0), "entries"], [String(data?.stats.survivors ?? 0), "still alive"], [`${data?.stats.collectedCards ?? 0} / ${data?.stats.entries ?? 0}`, "cards collected"], [money(data?.stats.prizeValueCents ?? 0), "pot value"],
      ].map(([value, label]) => <div className="admin-stat" key={label}><b>{value}</b><small>{label}</small></div>)}</section>
      {error && <div className="admin-alert error-alert" role="alert">{error}</div>}{message && <div className="admin-alert success-alert" role="status">{message}</div>}
      <div className="admin-grid">
        <section className="admin-panel roster-panel"><div className="admin-panel-title"><div><span className="panel-kicker">01 · PEOPLE & CARDS</span><h2>Entry check-in</h2></div><button className="small-toggle" onClick={() => void act("registration", { open: !data?.season.registrationOpen })} disabled={busy || data?.season.status === "complete" || (seasonReady && !data?.season.registrationOpen)}><span className={data?.season.registrationOpen ? "toggle-dot on" : "toggle-dot"} />{data?.season.registrationOpen ? "Registration open" : "Registration closed"}</button></div>
          {!data?.entries.length ? <div className="admin-empty"><span>✧</span><b>No entries yet.</b><small>Open registration to let staff sign up.</small></div> : <div className="roster-table"><div className="roster-head"><span>STAFF MEMBER</span><span>ENTRY</span><span>GIFT CARD</span><span>COLLECTION</span></div>{data.entries.map((entry) => <div className="roster-row" key={entry.id}><div className="roster-person"><span className="bear-dot">{entry.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span><span><b>{entry.name}</b><small>{entry.email}</small></span></div><div className="roster-number">#{entry.entryNumber}</div><div className="roster-card-type"><span className={entry.category === "spirits" ? "category-chip spirit-chip" : "category-chip"}>{entry.category === "spirits" ? "Spirits" : "Regular"}</span><small>{entry.merchant || "$25 card"}</small></div><div className="collection-cell">{entry.collectedAt ? <span className="collected-label">✓ Collected</span> : <><input aria-label={`Retailer for ${entry.name} entry ${entry.entryNumber}`} value={merchantDrafts[entry.id] ?? ""} placeholder="Retailer" onChange={(e) => setMerchantDrafts((old) => ({ ...old, [entry.id]: e.target.value }))} /><button className="mini-action" onClick={() => void act("collect", { entryId: entry.id, merchant: merchantDrafts[entry.id] || "Gift card" })} disabled={busy}>Confirm</button></>}</div></div>)}</div>}
          <div className="roster-bottom"><span>{allCollected ? "All $25 gift cards are confirmed." : "Confirm each card before creating teams."}</span><button className="button button-primary" disabled={busy || !allCollected || seasonReady || data?.entries.length === 0} onClick={() => void act("teams")}>{seasonReady ? "Teams created" : "Generate balanced teams"}<span className="button-sparkle">✦</span></button></div>
        </section>
        <section className="admin-panel schedule-admin"><div className="admin-panel-title"><div><span className="panel-kicker">02 · THE CALENDAR</span><h2>Draw schedule</h2></div><span className="calendar-icon">▦</span></div>
          <p className="help-copy schedule-rule-note">Weekdays only.{data?.season.year === 2026 ? " First draw: Monday, December 7. Final draw: Friday, December 18." : ""}</p>
          <form className="schedule-form" onSubmit={(e) => { e.preventDefault(); void act("schedule_add", { date: scheduleDate, count: scheduleCount }); }}><label>Draw date<input type="date" value={scheduleDate} min={scheduleMinDate} max={scheduleMaxDate} required onChange={(e) => { const nextDate = e.target.value; const day = new Date(`${nextDate}T12:00:00Z`).getUTCDay(); if (day === 0 || day === 6) { setError("Draws can only be scheduled Monday to Friday."); return; } setError(""); setScheduleDate(nextDate); }} /></label><label>Eliminations<select value={scheduleCount} onChange={(e) => setScheduleCount(Number(e.target.value))}>{Array.from({ length: 10 }, (_, i) => <option value={i + 1} key={i + 1}>{i + 1} per day</option>)}</select></label><button className="button button-dark" disabled={busy}>Save date</button></form>
          {data?.schedule.length ? <div className="admin-schedule-list">{data.schedule.map((item) => <div key={item.id}><span><b>{dateLabel(item.draw_date)}</b><small>{item.draws_planned} {item.draws_planned === 1 ? "draw" : "draws"}</small></span><button aria-label={`Remove ${item.draw_date} from schedule`} className="remove-date" onClick={() => void act("schedule_remove", { scheduleId: item.id })}>×</button></div>)}</div> : <div className="admin-empty short-empty"><span>◷</span><small>Add dates for the daily elimination reveal.</small></div>}
        </section>
        <section className="admin-panel audit-admin"><div className="admin-panel-title"><div><span className="panel-kicker">03 · FAIR PLAY</span><h2>Lock the draw</h2></div><span className="audit-icon">⌘</span></div>
          {data?.season.auditCommit ? <><div className="commit-status"><span className="commit-check">✓</span><div><b>Draw commitment is locked</b><small>Set {new Date(data.season.auditLockedAt ?? "").toLocaleString("en-CA", { timeZone: "America/Edmonton", dateStyle: "medium", timeStyle: "short" })}</small></div></div><code className="commit-hash">{data.season.auditCommit}</code><p className="help-copy">The draw seed is committed before the first elimination and revealed after the winner is determined.</p></> : <><p className="help-copy">Once teams and dates are set, lock a cryptographic seed. The public commitment makes later draws independently checkable.</p><button className="button button-dark full-button" disabled={busy || !seasonReady || !data?.schedule.length} onClick={() => void act("lock_audit")}>Lock public draw commitment <span>✦</span></button></>}
          <div className="draw-action-card"><div><small>TODAY · CALGARY</small><b>{todaySchedule ? `${todayDrawCount} of ${todaySchedule.draws_planned} draws completed` : "No draw scheduled today"}</b></div><label className="hat-draw-label">Name drawn from the hat<select value={hatEntryId} onChange={(event) => setHatEntryId(event.target.value)} disabled={busy || !todaySchedule || todayDrawCount >= (todaySchedule?.draws_planned ?? 0)}><option value="">Choose the filmed draw result</option>{data?.entries.filter((entry) => entry.status === "active").map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · Entry {entry.entryNumber} · {entry.teamName ?? "Unassigned"}</option>)}</select></label><button className="button button-red" disabled={busy || !data?.season.auditCommit || !todaySchedule || todayDrawCount >= (todaySchedule?.draws_planned ?? 0) || !data?.stats.survivors || !hatEntryId} onClick={() => void act("hat_draw", { entryId: hatEntryId })}>{busy ? "Recording…" : "Record filmed hat draw"}</button><button className="text-button random-draw-action" disabled={busy || !data?.season.auditCommit || !todaySchedule || todayDrawCount >= (todaySchedule?.draws_planned ?? 0) || !data?.stats.survivors} onClick={() => void act("draw")}>Use the site’s random draw instead</button></div>
        </section>
        <section className="admin-panel inventory-admin"><div className="admin-panel-title"><div><span className="panel-kicker">04 · THE GOODIES</span><h2>Gift-card inventory</h2></div><span className="gift-icon">▧</span></div><div className="inventory-totals"><div><small>COLLECTED</small><b>{data?.stats.collectedCards ?? 0}</b></div><div><small>UNDISTRIBUTED</small><b>{data?.entries.filter((e) => e.collectedAt && !e.distributedAt).length ?? 0}</b></div><div><small>TOTAL VALUE</small><b>{money(data?.stats.prizeValueCents ?? 0)}</b></div></div>
          {winner ? <><div className="inventory-winner"><span>✦</span><div><small>WINNING TEAM</small><b>{winner.name}</b></div></div><div className="even-split-card"><div><b>Split the cards evenly</b><small>{data?.winnerMembers?.length ?? 0} team members · $25 cards · as equal as the card count allows</small></div><button className="button button-dark" onClick={() => void act("auto_distribute")} disabled={busy || Boolean(data?.entries.some((entry) => entry.distributedAt))}>{data?.entries.some((entry) => entry.distributedAt) ? "Distribution started" : "Assign cards evenly"}</button></div><div className="winner-member-list">{data?.winnerMembers?.map((member) => <span key={member.name}><b>{member.name}</b><small>{member.distributed_cards} cards recorded</small></span>)}</div><div className="distribution-list">{data?.entries.filter((e) => e.collectedAt).map((entry) => <div className="distribution-row" key={entry.id}><span><b>{entry.merchant || "Gift card"}</b><small>{money(entry.cardValueCents ?? 2500)} · {entry.category === "spirits" ? "Spirits" : "Regular"}</small></span>{entry.distributedAt ? <span className="collected-label">To {entry.distributedTo}</span> : <div className="distribution-edit"><select aria-label={`Recipient for ${entry.merchant || "gift card"}`} value={distributionDrafts[entry.id] ?? ""} onChange={(e) => setDistributionDrafts((old) => ({ ...old, [entry.id]: e.target.value }))}><option value="">Recipient</option>{data?.winnerMembers?.map((member) => <option key={member.name} value={member.name}>{member.name}</option>)}</select><button className="mini-action" onClick={() => void act("distribute", { entryId: entry.id, recipient: distributionDrafts[entry.id] })} disabled={busy || !distributionDrafts[entry.id]}>Record</button></div>}</div>)}</div></> : <p className="help-copy">The pot is being tracked as cards arrive. Distribution tools unlock once one team has survived the field.</p>}
        </section>
        <section className="admin-panel season-admin"><div className="admin-panel-title"><div><span className="panel-kicker">05 · NEXT YEAR, NEXT CHANCE</span><h2>Season archive</h2></div><span className="season-icon">✧</span></div><p className="help-copy">Create a blank season for next year. The current season’s staff list and draw history stay archived and won’t carry forward.</p><div className="new-season-form"><label>Season year<input type="number" min={2027} max={2099} value={year} onChange={(e) => setYear(Number(e.target.value))} /></label><button className="button button-dark" disabled={busy} onClick={() => void act("new_season", { year })}>Create empty season</button></div></section>
        <section className="admin-panel share-admin"><div className="admin-panel-title"><div><span className="panel-kicker">06 · STAFF CHAT</span><h2>Share the daily update</h2></div><span className="share-admin-icon">✦</span></div><p className="help-copy">Create a shareable poster with the latest elimination and every entry grouped by team. Eliminated entries stay on the roster with a clear OUT mark.</p><button className="button button-dark full-button" onClick={() => void createPoster()} disabled={!data?.entries.length}>Create daily poster <span>✦</span></button></section>
      </div>
      <section className="admin-log"><div><span className="panel-kicker">RECENT ACTIVITY</span><h2>Organizer log</h2></div><div>{data?.audit.slice(0, 8).map((row, i) => <p key={`${row.created_at}-${i}`}><span className="log-dot" /><b>{row.action.replaceAll("_", " ")}</b><small>{new Date(row.created_at).toLocaleString("en-CA", { timeZone: "America/Edmonton", dateStyle: "short", timeStyle: "short" })}</small></p>)}</div></section>
      <div className="admin-logout"><span>Private organizer tools · Session expires after 8 hours</span><button onClick={() => void logout()}>Sign out</button></div>
      {posterUrl && <div className="poster-overlay" role="dialog" aria-modal="true" aria-label="Daily standings poster preview"><div className="poster-dialog"><button className="poster-close" onClick={() => { setPosterUrl(""); setPosterBlob(null); }} aria-label="Close poster preview">×</button><div className="poster-preview-wrap"><img src={posterUrl} alt="Daily survivor standings poster with every entry grouped by team and marked alive or out" /></div><div className="poster-controls"><div><b>Your daily update is ready.</b><small>Download the PNG or share it from your device.</small></div><button className="button button-outline-dark" onClick={downloadPoster}>Download image</button><button className="button button-primary" onClick={() => void sharePoster()}>Share image</button></div></div></div>}
      {posterError && <div className="poster-error" role="alert">{posterError}<button onClick={() => setPosterError("")}>Dismiss</button></div>}
      {showDraw && lastDraw && <div className="reveal-overlay admin-reveal" role="dialog" aria-modal="true"><div className="reveal-snow">✳　✦　✳</div><button className="reveal-close" onClick={() => setShowDraw(false)} aria-label="Close reveal">×</button><div className="reveal-kicker">DRAW #{String((data?.season.drawCount ?? 1)).padStart(2, "0")} · {lastDraw.method === "hat" ? "FILMED HAT DRAW" : "RANDOM DRAW"}</div><h2 className="reveal-headline">The draw has<br /><em>made its choice.</em></h2><div className="reveal-result"><span className="reveal-number">✦</span><div><b>{lastDraw.name}</b><small>{lastDraw.teamName} <span>·</span> Entry {lastDraw.entryNumber}</small></div><span className="reveal-stamp">OUT</span></div><p className="reveal-signoff">The result is saved to the public audit log.</p></div>}
    </>}
    <footer className="footer admin-footer"><a className="footer-brand" href="#top" onClick={onClose}>LAKESHORE <span>BEARS</span></a><span>STAFF GAME · ORGANIZER ACCESS</span><button onClick={onClose}>Back to live game</button></footer>
  </main>;
}
