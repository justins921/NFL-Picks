import "server-only";

const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl";

/** Seconds. Live scores need to be fresher than schedules and season stats. */
export const TTL = {
  liveScoreboard: 30,
  scoreboard: 300,
  summary: 300,
  seasonStats: 21_600,
} as const;

/**
 * All ESPN traffic goes through here so the browser never talks to ESPN
 * directly and every response is cached server-side.
 *
 * Returns null instead of throwing: a missing injury report or a 404 on stats
 * for a season that hasn't started should degrade one section of a page, not
 * take the whole page down.
 */
async function get<T>(url: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate },
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Bare scoreboard — ESPN answers with whatever week is current right now. */
export function fetchCurrentScoreboard() {
  return get<EspnScoreboard>(`${SITE}/scoreboard`, TTL.liveScoreboard);
}

export function fetchScoreboard(season: number, seasonType: number, week: number, live: boolean) {
  // NOTE: the year param is `dates`, not `year` — passing `year` is silently
  // ignored and you get the current season back instead.
  const url = `${SITE}/scoreboard?week=${week}&seasontype=${seasonType}&dates=${season}`;
  return get<EspnScoreboard>(url, live ? TTL.liveScoreboard : TTL.scoreboard);
}

export function fetchSummary(eventId: string, live: boolean) {
  return get<EspnSummary>(`${SITE}/summary?event=${eventId}`, live ? TTL.liveScoreboard : TTL.summary);
}

export function fetchTeamSeasonStats(season: number, teamId: string) {
  const url = `${CORE}/seasons/${season}/types/2/teams/${teamId}/statistics`;
  return get<EspnTeamStats>(url, TTL.seasonStats);
}

/**
 * Season record. This is the only same-season source for points allowed —
 * the statistics endpoint above reports it as 0.
 */
export function fetchTeamRecord(season: number, teamId: string) {
  const url = `${CORE}/seasons/${season}/types/2/teams/${teamId}/record`;
  return get<EspnTeamRecord>(url, TTL.seasonStats);
}

/* --- Minimal structural typings for the parts of ESPN's payloads we read. --- */

export interface EspnTeam {
  id: string;
  location?: string;
  name?: string;
  abbreviation?: string;
  displayName?: string;
  shortDisplayName?: string;
  color?: string;
  alternateColor?: string;
  logo?: string;
  logos?: { href: string }[];
}

export interface EspnCompetitor {
  id: string;
  homeAway: "home" | "away";
  team: EspnTeam;
  score?: string;
  winner?: boolean;
  records?: { name?: string; type?: string; summary?: string }[];
}

export interface EspnOdds {
  details?: string;
  overUnder?: number;
  homeTeamOdds?: { moneyLine?: number; close?: { odds?: string }; team?: { id?: string } };
  awayTeamOdds?: { moneyLine?: number; close?: { odds?: string }; team?: { id?: string } };
  moneyline?: {
    home?: { close?: { odds?: string }; open?: { odds?: string } };
    away?: { close?: { odds?: string }; open?: { odds?: string } };
  };
}

export interface EspnStatusType {
  state: "pre" | "in" | "post";
  completed: boolean;
  description?: string;
  shortDetail?: string;
  detail?: string;
}

export interface EspnEvent {
  id: string;
  date: string;
  name?: string;
  shortName?: string;
  season?: { year?: number; type?: number };
  week?: { number?: number };
  status: { type: EspnStatusType };
  competitions: {
    id: string;
    venue?: { fullName?: string; address?: { city?: string; state?: string } };
    competitors: EspnCompetitor[];
    broadcasts?: { market?: string; names?: string[] }[];
    odds?: EspnOdds[];
    status?: { type: EspnStatusType };
  }[];
}

export interface EspnScoreboard {
  season?: { year?: number; type?: number };
  week?: {
    number?: number;
    teamsOnBye?: { id: string; abbreviation?: string; displayName?: string; logo?: string }[];
  };
  events?: EspnEvent[];
}

export interface EspnInjuryEntry {
  status?: string;
  athlete?: {
    id?: string;
    displayName?: string;
    shortName?: string;
    position?: { abbreviation?: string; displayName?: string };
  };
  details?: { type?: string; returnDate?: string; detail?: string };
}

export interface EspnSummary {
  header?: {
    season?: { year?: number; type?: number };
    week?: number;
    competitions?: {
      competitors?: (EspnCompetitor & { record?: { type?: string; summary?: string }[] })[];
      status?: { type: EspnStatusType };
    }[];
  };
  injuries?: { team?: { id?: string }; injuries?: EspnInjuryEntry[] }[];
  predictor?: {
    homeTeam?: { id?: string; gameProjection?: string };
    awayTeam?: { id?: string; gameProjection?: string };
  };
  lastFiveGames?: {
    team?: { id?: string };
    events?: {
      atVs?: string;
      gameDate?: string;
      score?: string;
      gameResult?: string;
      opponent?: { abbreviation?: string; displayName?: string; logo?: string };
    }[];
  }[];
  boxscore?: { teams?: { team?: EspnTeam; statistics?: { name?: string; displayValue?: string }[] }[] };
}

export interface EspnTeamRecord {
  items?: {
    type?: string;
    summary?: string;
    stats?: { name?: string; displayValue?: string; value?: number }[];
  }[];
}

export interface EspnTeamStats {
  splits?: {
    categories?: { name?: string; stats?: { name?: string; displayValue?: string; value?: number }[] }[];
  };
}
