import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { gameSnapshots, games as gamesTable } from "@/db/schema";
import type { Game, GameDetail, Injury, TeamSeasonStats, WeekSlate, WinProbability } from "../types";
import {
  fetchCurrentScoreboard,
  fetchScoreboard,
  fetchSummary,
  fetchTeamRecord,
  fetchTeamSeasonStats,
} from "./client";
import {
  normalizeInjuries,
  normalizeLastFive,
  normalizeGame,
  normalizeSlate,
  normalizeTeamRecord,
  normalizeTeamStats,
  predictorProbability,
} from "./normalize";

export const REGULAR_SEASON = 2;
export const PRESEASON = 1;
export const POSTSEASON = 3;
export const WEEKS_IN_REGULAR_SEASON = 18;

export const DEFAULT_SEASON = Number(process.env.NFL_SEASON ?? "2026");

export interface CurrentWeek {
  season: number;
  seasonType: number;
  week: number;
}

/**
 * ESPN's bare scoreboard reports whichever week is current today. Before the
 * season opens that's Week 1 of the upcoming regular season, which is exactly
 * what we want to land on. Anything outside the regular season (preseason now,
 * playoffs later) falls back to Week 1 since this app defaults to the regular
 * season.
 */
export async function getCurrentWeek(): Promise<CurrentWeek> {
  const data = await fetchCurrentScoreboard();
  const season = data?.season?.year;
  const seasonType = data?.season?.type;
  const week = data?.week?.number;

  if (season && seasonType === REGULAR_SEASON && week && week >= 1 && week <= WEEKS_IN_REGULAR_SEASON) {
    return { season, seasonType: REGULAR_SEASON, week };
  }
  return { season: season ?? DEFAULT_SEASON, seasonType: REGULAR_SEASON, week: 1 };
}

function isLiveWindow(games: Game[]): boolean {
  return games.some((g) => g.state === "in");
}

/** Mirrors each game's outcome into our DB so standings never depend on ESPN. */
function persistGames(games: Game[]) {
  for (const g of games) {
    db.insert(gamesTable)
      .values({
        id: g.id,
        season: g.season,
        seasonType: g.seasonType,
        week: g.week,
        kickoff: g.kickoff,
        homeTeamId: g.home.id,
        awayTeamId: g.away.id,
        homeAbbr: g.home.abbreviation,
        awayAbbr: g.away.abbreviation,
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        state: g.state,
        completed: g.completed,
        winnerTeamId: g.winnerTeamId,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: gamesTable.id,
        set: {
          kickoff: g.kickoff,
          homeScore: g.homeScore,
          awayScore: g.awayScore,
          state: g.state,
          completed: g.completed,
          winnerTeamId: g.winnerTeamId,
          week: g.week,
          seasonType: g.seasonType,
          updatedAt: new Date().toISOString(),
        },
      })
      .run();
  }
}

export async function getWeekSlate(season: number, seasonType: number, week: number): Promise<WeekSlate> {
  const first = await fetchScoreboard(season, seasonType, week, false);
  if (!first) return { meta: { season, seasonType, week, teamsOnBye: [] }, games: [] };

  let slate = normalizeSlate(first, { season, seasonType, week });

  // If anything is in progress, re-fetch on the short TTL so scores are fresh.
  if (isLiveWindow(slate.games)) {
    const live = await fetchScoreboard(season, seasonType, week, true);
    if (live) slate = normalizeSlate(live, { season, seasonType, week });
  }

  persistGames(slate.games);
  return slate;
}

/** True once kickoff has passed — picks are frozen from this moment. */
export function isLocked(game: Pick<Game, "kickoff" | "state">, now = Date.now()): boolean {
  if (game.state !== "pre") return true;
  const kickoff = new Date(game.kickoff).getTime();
  return Number.isFinite(kickoff) && now >= kickoff;
}

interface Snapshot {
  winProbability: WinProbability | null;
  injuries: { home: Injury[]; away: Injury[] } | null;
}

function readSnapshot(gameId: string): Snapshot | null {
  const row = db.select().from(gameSnapshots).where(eq(gameSnapshots.gameId, gameId)).get();
  if (!row) return null;
  try {
    return {
      winProbability: row.winProbability ? (JSON.parse(row.winProbability) as WinProbability) : null,
      injuries: row.injuries ? (JSON.parse(row.injuries) as { home: Injury[]; away: Injury[] }) : null,
    };
  } catch {
    return null;
  }
}

function writeSnapshot(gameId: string, snap: Snapshot) {
  db.insert(gameSnapshots)
    .values({
      gameId,
      capturedAt: new Date().toISOString(),
      winProbability: snap.winProbability ? JSON.stringify(snap.winProbability) : null,
      injuries: snap.injuries ? JSON.stringify(snap.injuries) : null,
    })
    .onConflictDoNothing()
    .run();
}

/**
 * Season stats for a team, falling back to last season when the current one
 * hasn't produced any games yet. The returned `season` field tells the UI which
 * year it's actually looking at.
 */
async function getTeamStats(season: number, teamId: string): Promise<TeamSeasonStats | null> {
  for (const year of [season, season - 1]) {
    const raw = await fetchTeamSeasonStats(year, teamId);
    if (!raw?.splits?.categories?.length) continue;

    const stats = normalizeTeamStats(raw, teamId, year);

    // Points allowed only exists on the record endpoint, and we read it for
    // the same year the rest of the numbers came from so nothing is mixed.
    const record = await fetchTeamRecord(year, teamId);
    const points = record ? normalizeTeamRecord(record) : null;
    if (points) {
      stats.pointsAllowedPerGame = points.pointsAllowedPerGame;
      stats.pointsPerGame = points.pointsPerGame ?? stats.pointsPerGame;
    }
    return stats;
  }
  return null;
}

export async function getGameDetail(eventId: string): Promise<GameDetail | null> {
  const cached = db.select().from(gamesTable).where(eq(gamesTable.id, eventId)).get();
  const live = cached?.state === "in";

  const summary = await fetchSummary(eventId, live);
  if (!summary) return null;

  const header = summary.header;
  const season = header?.season?.year ?? cached?.season ?? DEFAULT_SEASON;
  const seasonType = header?.season?.type ?? cached?.seasonType ?? REGULAR_SEASON;
  const week = header?.week ?? cached?.week ?? 1;

  // Prefer the scoreboard's version of the game: the summary payload leaves out
  // kickoff time, venue, broadcast and odds. It's the same cached request the
  // week view already made, so this costs nothing extra.
  const slate = await getWeekSlate(season, seasonType, week);
  let game = slate.games.find((g) => g.id === eventId) ?? null;

  if (!game) {
    // Fall back to the summary's own competition block for anything the
    // scoreboard doesn't list (a rescheduled game, say).
    const competition = header?.competitions?.[0];
    if (!competition?.competitors?.length) return null;
    game = normalizeGame(
      {
        id: eventId,
        date: cached?.kickoff ?? new Date().toISOString(),
        season: { year: season, type: seasonType },
        week: { number: week },
        status: competition.status ?? { type: { state: "pre", completed: false } },
        competitions: [competition as never],
      },
      { season, seasonType, week },
    );
    if (!game) return null;
    if (cached?.kickoff) game.kickoff = cached.kickoff;
  }

  const homeId = game.home.id;
  const awayId = game.away.id;

  const locked = isLocked(game);
  const existing = locked ? readSnapshot(eventId) : null;

  const liveInjuries = {
    home: normalizeInjuries(summary, homeId),
    away: normalizeInjuries(summary, awayId),
  };
  const injuriesAvailable = (summary.injuries?.length ?? 0) > 0;

  const liveProbability =
    predictorProbability(summary, homeId, awayId) ?? game.winProbability ?? null;

  let injuries = liveInjuries;
  let winProbability = liveProbability;
  let snapshotted = false;

  if (existing) {
    // Frozen at kickoff — later report changes don't rewrite history.
    if (existing.injuries) injuries = existing.injuries;
    if (existing.winProbability) winProbability = existing.winProbability;
    snapshotted = true;
  } else if (locked) {
    writeSnapshot(eventId, {
      winProbability: liveProbability,
      injuries: injuriesAvailable ? liveInjuries : null,
    });
    snapshotted = true;
  }

  game.winProbability = winProbability;

  const [homeStats, awayStats] = await Promise.all([
    getTeamStats(season, homeId),
    getTeamStats(season, awayId),
  ]);

  if (game.completed) persistGames([game]);

  return {
    game,
    injuries,
    injuriesAvailable: injuriesAvailable || snapshotted,
    stats: { home: homeStats, away: awayStats },
    lastFive: {
      home: normalizeLastFive(summary, homeId),
      away: normalizeLastFive(summary, awayId),
    },
    snapshotted,
  };
}
