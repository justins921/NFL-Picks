/**
 * Checks the rules that matter and that we cannot wait on real kickoffs for:
 * picks lock at kickoff, ties are pushes, and standings add up.
 *
 * Run with `npm test` — it uses a throwaway database, never your real one.
 */
/** Exercises lock-at-kickoff and grading against a scratch database. */

if (!process.env.DATABASE_URL?.includes("test")) {
  console.error("Refusing to run: set DATABASE_URL to a throwaway file (npm test does this).");
  process.exit(1);
}

import { db } from "@/db";
import { migrate } from "@/db/migrate";
import { games, picks, users } from "@/db/schema";
import { gradePick, getStandings, savePick, formatStreak, getFamilyPicksForLockedGames, fillMissedPicks } from "@/lib/picks";
import { isLocked } from "@/lib/espn/season";
import type { Game, Team } from "@/lib/types";

await migrate();
await db.delete(picks); await db.delete(games); await db.delete(users);

const team = (id: string, abbr: string): Team => ({
  id, abbreviation: abbr, displayName: abbr, shortName: abbr, location: abbr,
  nickname: abbr, color: "#111111", altColor: "#222222", logo: "",
});

const mkGame = (id: string, kickoff: string, week: number): Game => ({
  id, season: 2026, seasonType: 2, week, kickoff, state: "pre", completed: false,
  statusDetail: "", home: team("H" + id, "HOM"), away: team("A" + id, "AWY"),
  homeScore: null, awayScore: null, winnerTeamId: null, network: null, venue: null,
  spread: null, overUnder: null, winProbability: null,
});

const future = new Date(Date.now() + 3600_000).toISOString();
const past = new Date(Date.now() - 3600_000).toISOString();

let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
  if (ok) pass++;
  else fail++;
};

await db.insert(users).values([{ id: 1, name: "A" }, { id: 2, name: "B" }]);

// --- lock behaviour ---
check("future game is open", isLocked(mkGame("1", future, 1)), false);
check("past kickoff is locked", isLocked(mkGame("2", past, 1)), true);
check("in-progress game is locked", isLocked({ ...mkGame("3", future, 1), state: "in" }), true);

check("pick on open game saves", await savePick(1, mkGame("1", future, 1), "H1"), { ok: true });
check("pick after kickoff refused", await savePick(1, mkGame("2", past, 1), "H2"), { ok: false, reason: "locked" });
check("pick for a team not in the game refused",
  await savePick(1, mkGame("1", future, 1), "ZZZ"), { ok: false, reason: "unknown-game" });

// changing an open pick overwrites rather than duplicating
await savePick(1, mkGame("1", future, 1), "A1");
const afterChange = await db.select().from(picks);
check("changing a pick keeps one row", afterChange.length, 1);
check("changed pick stored", afterChange[0].pickedTeamId, "A1");

// --- grading ---
check("win", gradePick("H9", { completed: true, winnerTeamId: "H9" }), "win");
check("loss", gradePick("A9", { completed: true, winnerTeamId: "H9" }), "loss");
check("tie is a push", gradePick("H9", { completed: true, winnerTeamId: "TIE" }), "push");
check("unfinished game is pending", gradePick("H9", { completed: false, winnerTeamId: null }), "pending");

// --- standings over a finished stretch ---
await db.delete(picks);
const results: [string, number, string][] = [
  // gameId, week, winner
  ["g1", 1, "Hg1"], ["g2", 1, "Hg2"], ["g3", 2, "Ag3"], ["g4", 2, "TIE"], ["g5", 3, "Hg5"],
];
for (const [i, [id, week, winner]] of results.entries()) {
  await db.insert(games).values({
    id, season: 2026, seasonType: 2, week,
    kickoff: new Date(Date.now() - (10 - i) * 86_400_000).toISOString(),
    homeTeamId: "H" + id, awayTeamId: "A" + id, homeAbbr: "HOM", awayAbbr: "AWY",
    homeScore: 20, awayScore: 17, state: "post", completed: true, winnerTeamId: winner,
  });
}

// A picks the home team every time; B picks away every time.
for (const [id, week] of results) {
  await db.insert(picks).values({ userId: 1, gameId: id, season: 2026, seasonType: 2, week, pickedTeamId: "H" + id });
  await db.insert(picks).values({ userId: 2, gameId: id, season: 2026, seasonType: 2, week, pickedTeamId: "A" + id });
}

const table = await getStandings(2026, 2);
const A = table.find((r) => r.name === "A")!;
const B = table.find((r) => r.name === "B")!;

// A: g1 W, g2 W, g3 L, g4 push, g5 W  => 3-1-1, current streak W1
check("A record", [A.wins, A.losses, A.pushes], [3, 1, 1]);
check("A streak", formatStreak(A.streak), "W1");
// B: g1 L, g2 L, g3 W, g4 push, g5 L  => 1-3-1, current streak L1
check("B record", [B.wins, B.losses, B.pushes], [1, 3, 1]);
check("B streak", formatStreak(B.streak), "L1");
check("standings sorted by wins", table.map((r) => r.name), ["A", "B"]);
check("A week 1 record", A.weeklyRecords.find((w) => w.week === 1), { week: 1, wins: 2, losses: 0, pushes: 0 });
check("A week 2 record", A.weeklyRecords.find((w) => w.week === 2), { week: 2, wins: 0, losses: 1, pushes: 1 });
check("pushes excluded from win pct", A.winPct, 0.75);

// --- the app's own setup must upgrade an older database, not just build a new one ---
// This is the failure that reached production: columns added later lived only
// in the db:migrate script, while a deployed app sets itself up through the
// bootstrap path. Nobody runs the script against a hosted database, so the new
// columns were never added and every query naming one failed.
{
  const { createClient } = await import("@libsql/client");
  const { withBootstrap } = await import("@/db/bootstrap");
  const { unlinkSync } = await import("node:fs");

  const path = "./data/test-upgrade.db";
  for (const suffix of ["", "-wal", "-shm"]) {
    try { unlinkSync(path + suffix); } catch { /* not there yet */ }
  }

  const raw = createClient({ url: `file:${path}` });
  // An older release's schema: the tables exist, the later columns don't.
  await raw.execute(`CREATE TABLE picks (id INTEGER PRIMARY KEY, user_id INTEGER,
    game_id TEXT, season INTEGER, season_type INTEGER, week INTEGER,
    picked_team_id TEXT, created_at TEXT, updated_at TEXT)`);
  await raw.execute(`CREATE TABLE games (id TEXT PRIMARY KEY, season INTEGER,
    season_type INTEGER, week INTEGER, kickoff TEXT, home_team_id TEXT,
    away_team_id TEXT, home_abbr TEXT, away_abbr TEXT, home_score INTEGER,
    away_score INTEGER, state TEXT, completed INTEGER, winner_team_id TEXT,
    updated_at TEXT)`);

  const before = await raw.execute("PRAGMA table_info(games)");
  check("starts without the later column", before.rows.some((r) => r.name === "favorite_team_id"), false);

  // Any query through the app's client triggers setup.
  await withBootstrap(raw).execute("SELECT 1");

  const picksCols = await raw.execute("PRAGMA table_info(picks)");
  const gamesCols = await raw.execute("PRAGMA table_info(games)");
  check("the app adds picks.auto to an older database",
    picksCols.rows.some((r) => r.name === "auto"), true);
  check("the app adds games.favorite_team_id to an older database",
    gamesCols.rows.some((r) => r.name === "favorite_team_id"), true);
}

// --- adding a column must survive several instances starting at once ---
// SQLite has no "ADD COLUMN IF NOT EXISTS", so the presence check isn't atomic.
// A deploy cold-starts several instances together; before this was handled, all
// but one died on "duplicate column name" and every request they served failed.
{
  const { createClient } = await import("@libsql/client");
  const { migrate: migrateAgain } = await import("@/db/migrate");

  const settled = await Promise.allSettled([
    migrateAgain(), migrateAgain(), migrateAgain(), migrateAgain(),
  ]);
  const failures = settled.filter((r) => r.status === "rejected");
  check("four concurrent migrations all succeed", failures.length, 0);
  if (failures.length > 0) {
    console.log("   ->", String((failures[0] as PromiseRejectedResult).reason).slice(0, 120));
  }
  void createClient;
}

// --- the closing line tells us who was favoured, after the fact ---
{
  const { closingFavorite } = await import("@/lib/espn/normalize");
  const ml = (home: string, away: string) => ({
    items: [{
      homeTeamOdds: { close: { moneyLine: { american: home } } },
      awayTeamOdds: { close: { moneyLine: { american: away } } },
    }],
  });

  check("the shorter price is the favourite (home)", closingFavorite(ml("-245", "+200"), "H", "A"), "H");
  check("the shorter price is the favourite (away)", closingFavorite(ml("+160", "-190"), "H", "A"), "A");
  check("a pick'em has no favourite", closingFavorite(ml("-110", "-110"), "H", "A"), null);
  check("no prices, no guess", closingFavorite({ items: [{}] }, "H", "A"), null);
  check("no odds at all, no guess", closingFavorite({}, "H", "A"), null);
  check("falls back to the payload's own flag",
    closingFavorite({ items: [{ awayTeamOdds: { favorite: true } }] }, "H", "A"), "A");
}

// --- a missed pick is filled with the favourite at kickoff ---
{
  await db.delete(picks);
  await db.delete(games);

  const base = {
    season: 2026, seasonType: 2, week: 3, kickoff: past,
    awayTeamId: "AWAY", homeAbbr: "HOM", awayAbbr: "AWY",
    homeScore: null, awayScore: null, state: "post" as const,
  };
  await db.insert(games).values([
    // a line was recorded before kickoff, and the underdog went on to win
    { ...base, id: "fav", homeTeamId: "HOME", favoriteTeamId: "AWAY",
      completed: true, winnerTeamId: "HOME" },
    // no line was ever seen, so the home team is the fallback
    { ...base, id: "noline", homeTeamId: "HOME", favoriteTeamId: null,
      completed: true, winnerTeamId: "AWAY" },
  ]);

  // user 1 picked one game themselves; user 2 picked nothing
  await db.insert(picks).values({
    userId: 1, gameId: "fav", season: 2026, seasonType: 2, week: 3, pickedTeamId: "HOME",
  });

  const lockedRows = await db.select().from(games);
  const filled = await fillMissedPicks(lockedRows);
  check("fills only the gaps", filled, 3);

  const all = await db.select().from(picks);
  const of = (u: number, g: string) => all.find((p) => p.userId === u && p.gameId === g);

  check("a real pick is left alone", [of(1, "fav")?.pickedTeamId, of(1, "fav")?.auto], ["HOME", false]);
  check("a gap takes the recorded favourite", of(2, "fav")?.pickedTeamId, "AWAY");
  check("the filled pick is flagged as auto", of(2, "fav")?.auto, true);
  check("with no line recorded, the home team is used", of(1, "noline")?.pickedTeamId, "HOME");

  // The favourite lost "fav" and the home fallback lost "noline": if the fill
  // were reading results rather than pre-kickoff data, these would be winners.
  check("filling never picks the winner by peeking at the result",
    [of(2, "fav")?.pickedTeamId === "HOME", of(1, "noline")?.pickedTeamId === "AWAY"],
    [false, false]);

  const again = await fillMissedPicks(lockedRows);
  check("running twice adds nothing", again, 0);
  check("and leaves the row count alone", (await db.select().from(picks)).length, 4);

  await db.delete(picks);
  await db.delete(games);
}

// --- other people's picks are only readable once a game has locked ---
// The guarantee is that unlocked picks are never loaded, so the check that
// matters is that this helper returns strictly what it was asked for.
{
  await db.delete(picks);
  await db.insert(picks).values([
    { userId: 1, gameId: "locked1", season: 2026, seasonType: 2, week: 1, pickedTeamId: "A" },
    { userId: 2, gameId: "locked1", season: 2026, seasonType: 2, week: 1, pickedTeamId: "B" },
    { userId: 1, gameId: "open1", season: 2026, seasonType: 2, week: 1, pickedTeamId: "A" },
    { userId: 2, gameId: "open1", season: 2026, seasonType: 2, week: 1, pickedTeamId: "B" },
  ]);

  const revealed = await getFamilyPicksForLockedGames(["locked1"]);
  check("reveals every family member for a locked game",
    revealed.map((r) => r.name).sort(), ["A", "B"]);
  check("reveals nothing for a game not passed in",
    revealed.some((r) => r.gameId === "open1"), false);
  check("reveals nothing when no games have locked",
    (await getFamilyPicksForLockedGames([])).length, 0);
  await db.delete(picks);
}

// --- the driver wrapper must work for both client kinds ---
// The remote client's `closed` getter reads a private field. A wrapper that
// forwards property access with itself as the receiver throws on it — and,
// because the local file-backed client has no such getter, that failure only
// ever shows up once deployed.
{
  const { createClient } = await import("@libsql/client");
  const { withBootstrap } = await import("@/db/bootstrap");

  for (const [kind, url] of [
    ["local file", "file:./data/test-wrapper.db"],
    ["remote", "libsql://example.turso.io"],
  ] as const) {
    const wrapped = withBootstrap(createClient({ url, authToken: "x" }));
    let ok = true;
    try {
      void wrapped.closed;
      void wrapped.protocol;
    } catch {
      ok = false;
    }
    check(`${kind} client: wrapper exposes closed/protocol`, ok, true);
    check(`${kind} client: wrapper keeps the query methods`,
      ["execute", "batch", "migrate", "transaction", "executeMultiple"]
        .every((m) => typeof (wrapped as unknown as Record<string, unknown>)[m] === "function"),
      true);
  }
}

// --- credentials survive a copy-paste that picks up invisible characters ---
{
  const { clean } = await import("@/db/credentials");
  const SEP = String.fromCharCode(0x2028); // line separator, as pasted from a wrapped page

  check("strips a U+2028 line separator", clean(`abc${SEP}def`), "abcdef");
  check("strips newlines and stray spaces", clean(" ab\ncd\r\n ef "), "abcdef");
  check("strips a non-breaking space", clean("ab\u00a0cd"), "abcd");
  check("leaves a clean value alone", clean("libsql://x.turso.io"), "libsql://x.turso.io");
  check("passes undefined through", clean(undefined), undefined);

  let rejected = false;
  try {
    clean("token-with-emoji-🎉");
  } catch {
    rejected = true;
  }
  check("rejects a character that cannot go in a header", rejected, true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
