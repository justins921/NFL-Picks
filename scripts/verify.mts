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
import { gradePick, getStandings, savePick, formatStreak } from "@/lib/picks";
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
