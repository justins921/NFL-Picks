import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { games as gamesTable, picks as picksTable, users } from "@/db/schema";
import type { Game, PickResult, StandingsRow } from "./types";
import { isLocked } from "./espn/season";

export { formatStreak } from "./types";
export type { PickResult, StandingsRow } from "./types";

export interface PickView {
  gameId: string;
  pickedTeamId: string;
  result: PickResult;
}

export function getPicksForWeek(userId: number, season: number, seasonType: number, week: number) {
  return db
    .select()
    .from(picksTable)
    .where(
      and(
        eq(picksTable.userId, userId),
        eq(picksTable.season, season),
        eq(picksTable.seasonType, seasonType),
        eq(picksTable.week, week),
      ),
    )
    .all();
}

export function getPicksForGames(gameIds: string[]) {
  if (gameIds.length === 0) return [];
  return db.select().from(picksTable).where(inArray(picksTable.gameId, gameIds)).all();
}

/** A tie is a push — nobody gets credit, nobody takes a loss. */
export function gradePick(pickedTeamId: string, game: { completed: boolean; winnerTeamId: string | null }): PickResult {
  if (!game.completed || !game.winnerTeamId) return "pending";
  if (game.winnerTeamId === "TIE") return "push";
  return game.winnerTeamId === pickedTeamId ? "win" : "loss";
}

export type SavePickOutcome =
  | { ok: true }
  | { ok: false; reason: "locked" | "unknown-game" | "no-user" };

/**
 * Writes a pick, refusing once the game has kicked off. The lock is enforced
 * here on the server — the disabled buttons in the UI are a convenience, not
 * the rule.
 */
export function savePick(userId: number, game: Game, pickedTeamId: string): SavePickOutcome {
  if (pickedTeamId !== game.home.id && pickedTeamId !== game.away.id) {
    return { ok: false, reason: "unknown-game" };
  }
  if (isLocked(game)) return { ok: false, reason: "locked" };

  const now = new Date().toISOString();
  db.insert(picksTable)
    .values({
      userId,
      gameId: game.id,
      season: game.season,
      seasonType: game.seasonType,
      week: game.week,
      pickedTeamId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [picksTable.userId, picksTable.gameId],
      set: { pickedTeamId, updatedAt: now },
    })
    .run();

  return { ok: true };
}


function streakLabelSort(a: StandingsRow, b: StandingsRow): number {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (a.losses !== b.losses) return a.losses - b.losses;
  return a.name.localeCompare(b.name);
}

/**
 * Season standings, graded straight off our own cached game results so a
 * family member's record doesn't move if ESPN is down.
 */
export function getStandings(season: number, seasonType: number): StandingsRow[] {
  const allUsers = db.select().from(users).where(eq(users.active, true)).all();

  const allPicks = db
    .select()
    .from(picksTable)
    .where(and(eq(picksTable.season, season), eq(picksTable.seasonType, seasonType)))
    .all();

  const allGames = db
    .select()
    .from(gamesTable)
    .where(and(eq(gamesTable.season, season), eq(gamesTable.seasonType, seasonType)))
    .all();

  const gameById = new Map(allGames.map((g) => [g.id, g]));

  const rows: StandingsRow[] = allUsers.map((u) => {
    const mine = allPicks
      .filter((p) => p.userId === u.id)
      .map((p) => {
        const game = gameById.get(p.gameId);
        return {
          week: p.week,
          kickoff: game?.kickoff ?? "",
          result: game ? gradePick(p.pickedTeamId, game) : ("pending" as const),
        };
      });

    let wins = 0;
    let losses = 0;
    let pushes = 0;
    let pending = 0;
    const byWeek = new Map<number, { week: number; wins: number; losses: number; pushes: number }>();

    for (const m of mine) {
      if (m.result === "win") wins++;
      else if (m.result === "loss") losses++;
      else if (m.result === "push") pushes++;
      else pending++;

      if (m.result === "pending") continue;
      const bucket = byWeek.get(m.week) ?? { week: m.week, wins: 0, losses: 0, pushes: 0 };
      if (m.result === "win") bucket.wins++;
      else if (m.result === "loss") bucket.losses++;
      else bucket.pushes++;
      byWeek.set(m.week, bucket);
    }

    // Streak runs backwards through decided games in kickoff order. Pushes
    // neither extend nor break it.
    const decided = mine
      .filter((m) => m.result === "win" || m.result === "loss")
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff));

    let streak = 0;
    for (let i = decided.length - 1; i >= 0; i--) {
      const isWin = decided[i].result === "win";
      if (streak === 0) streak = isWin ? 1 : -1;
      else if (isWin && streak > 0) streak++;
      else if (!isWin && streak < 0) streak--;
      else break;
    }

    const decidedCount = wins + losses;

    return {
      userId: u.id,
      name: u.name,
      wins,
      losses,
      pushes,
      pending,
      winPct: decidedCount === 0 ? 0 : wins / decidedCount,
      streak,
      weeklyRecords: [...byWeek.values()].sort((a, b) => a.week - b.week),
    };
  });

  return rows.sort(streakLabelSort);
}
