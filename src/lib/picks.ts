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
    );
}

export async function getMyPickForGame(userId: number, gameId: string) {
  const rows = await db
    .select()
    .from(picksTable)
    .where(and(eq(picksTable.userId, userId), eq(picksTable.gameId, gameId)))
    .limit(1);
  return rows[0] ?? null;
}

export interface FamilyPick {
  gameId: string;
  userId: number;
  name: string;
  pickedTeamId: string;
}

/**
 * Everyone's picks for the given games.
 *
 * Only ever call this with games that have already kicked off. Whose pick is
 * whose stays secret until the game locks, and the way that is guaranteed is by
 * never loading the rows in the first place — the caller filters the game list,
 * so an unlocked pick is never sent to a browser to be hidden with CSS.
 *
 * Includes people who have since been removed from the family, so past weeks
 * still read correctly.
 */
export async function getFamilyPicksForLockedGames(lockedGameIds: string[]): Promise<FamilyPick[]> {
  if (lockedGameIds.length === 0) return [];
  return db
    .select({
      gameId: picksTable.gameId,
      userId: picksTable.userId,
      name: users.name,
      pickedTeamId: picksTable.pickedTeamId,
    })
    .from(picksTable)
    .innerJoin(users, eq(picksTable.userId, users.id))
    .where(inArray(picksTable.gameId, lockedGameIds));
}

/** How far through the week each family member is. Counts only — no teams. */
export async function getWeekProgress(
  season: number,
  seasonType: number,
  week: number,
): Promise<{ userId: number; name: string; made: number }[]> {
  const [family, weekPicks] = await Promise.all([
    db.select().from(users).where(eq(users.active, true)),
    db
      .select()
      .from(picksTable)
      .where(
        and(
          eq(picksTable.season, season),
          eq(picksTable.seasonType, seasonType),
          eq(picksTable.week, week),
        ),
      ),
  ]);

  return family
    .map((u) => ({
      userId: u.id,
      name: u.name,
      made: weekPicks.filter((p) => p.userId === u.id).length,
    }))
    .sort((a, b) => b.made - a.made || a.name.localeCompare(b.name));
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
export async function savePick(userId: number, game: Game, pickedTeamId: string): Promise<SavePickOutcome> {
  if (pickedTeamId !== game.home.id && pickedTeamId !== game.away.id) {
    return { ok: false, reason: "unknown-game" };
  }
  if (isLocked(game)) return { ok: false, reason: "locked" };

  const now = new Date().toISOString();
  await db
    .insert(picksTable)
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
    });

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
export async function getStandings(season: number, seasonType: number): Promise<StandingsRow[]> {
  // One round trip instead of three — this runs on every standings render.
  const [allUsers, allPicks, allGames] = await Promise.all([
    db.select().from(users).where(eq(users.active, true)),
    db
      .select()
      .from(picksTable)
      .where(and(eq(picksTable.season, season), eq(picksTable.seasonType, seasonType))),
    db
      .select()
      .from(gamesTable)
      .where(and(eq(gamesTable.season, season), eq(gamesTable.seasonType, seasonType))),
  ]);

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
