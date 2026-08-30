import type {
  EspnCompetitor,
  EspnEvent,
  EspnInjuryEntry,
  EspnOdds,
  EspnScoreboard,
  EspnSummary,
  EspnTeamRecord,
  EspnTeamStats,
} from "./client";
import { devig, parseAmerican } from "../odds";
import type {
  Game,
  Injury,
  InjuryStatus,
  LastFiveGame,
  Team,
  TeamSeasonStats,
  WeekSlate,
  WinProbability,
} from "../types";

/** Positions a casual fan actually asks about. Everyone else is listed after. */
const KEY_POSITIONS = new Set(["QB", "RB", "WR", "TE", "LT", "OT", "T", "DE", "EDGE", "OLB", "CB"]);

const STATUS_ORDER: Record<InjuryStatus, number> = {
  Out: 0,
  "Injured Reserve": 1,
  Doubtful: 2,
  Questionable: 3,
  Suspension: 4,
  "Day-To-Day": 5,
  Other: 6,
};

function recordOf(c: EspnCompetitor, type: string): string | undefined {
  return c.records?.find((r) => r.type === type || r.name?.toLowerCase() === type)?.summary;
}

function normalizeTeam(c: EspnCompetitor): Team {
  const t = c.team;
  const abbr = t.abbreviation ?? "";
  return {
    id: t.id,
    abbreviation: abbr,
    displayName: t.displayName ?? abbr,
    shortName: t.shortDisplayName ?? t.name ?? abbr,
    location: t.location ?? "",
    nickname: t.name ?? abbr,
    color: t.color ? `#${t.color}` : "#334155",
    altColor: t.alternateColor ? `#${t.alternateColor}` : "#64748b",
    logo: t.logo ?? t.logos?.[0]?.href ?? `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`,
    record: recordOf(c, "total"),
    homeRecord: recordOf(c, "home"),
    awayRecord: recordOf(c, "road"),
  };
}

/**
 * Pulls a moneyline pair out of ESPN's odds block. ESPN has moved this around
 * over the years, so we check both the modern nested shape and the flat one.
 */
function moneylinePair(odds: EspnOdds | undefined): { home: number; away: number } | null {
  if (!odds) return null;
  const home =
    parseAmerican(odds.moneyline?.home?.close?.odds) ??
    parseAmerican(odds.moneyline?.home?.open?.odds) ??
    parseAmerican(odds.homeTeamOdds?.close?.odds) ??
    parseAmerican(odds.homeTeamOdds?.moneyLine);
  const away =
    parseAmerican(odds.moneyline?.away?.close?.odds) ??
    parseAmerican(odds.moneyline?.away?.open?.odds) ??
    parseAmerican(odds.awayTeamOdds?.close?.odds) ??
    parseAmerican(odds.awayTeamOdds?.moneyLine);
  if (home === null || away === null) return null;
  return { home, away };
}

/** Book prices, vig removed. Labeled as such wherever it's displayed. */
export function impliedFromOdds(odds: EspnOdds | undefined): WinProbability | null {
  const ml = moneylinePair(odds);
  if (!ml) return null;
  const p = devig(ml.home, ml.away);
  if (!p) return null;
  return { home: p.home, away: p.away, source: "implied from odds, not a model" };
}

export function normalizeGame(event: EspnEvent, fallback: { season: number; seasonType: number; week: number }): Game | null {
  const comp = event.competitions?.[0];
  if (!comp) return null;

  const homeC = comp.competitors?.find((c) => c.homeAway === "home");
  const awayC = comp.competitors?.find((c) => c.homeAway === "away");
  if (!homeC || !awayC) return null;

  const statusType = comp.status?.type ?? event.status?.type;
  const state = statusType?.state ?? "pre";
  const completed = statusType?.completed ?? false;

  const homeScore = homeC.score != null && homeC.score !== "" ? Number(homeC.score) : null;
  const awayScore = awayC.score != null && awayC.score !== "" ? Number(awayC.score) : null;

  let winnerTeamId: string | null = null;
  if (completed) {
    if (homeC.winner) winnerTeamId = homeC.team.id;
    else if (awayC.winner) winnerTeamId = awayC.team.id;
    else if (homeScore !== null && awayScore !== null) {
      // ESPN omits `winner` on ties; fall back to the scores.
      if (homeScore > awayScore) winnerTeamId = homeC.team.id;
      else if (awayScore > homeScore) winnerTeamId = awayC.team.id;
      else winnerTeamId = "TIE";
    }
  }

  const national = comp.broadcasts?.find((b) => b.market === "national")?.names?.[0];
  const anyBroadcast = comp.broadcasts?.flatMap((b) => b.names ?? [])[0];

  return {
    id: event.id,
    season: event.season?.year ?? fallback.season,
    seasonType: event.season?.type ?? fallback.seasonType,
    week: event.week?.number ?? fallback.week,
    kickoff: event.date,
    state,
    completed,
    statusDetail: statusType?.shortDetail ?? statusType?.description ?? "",
    home: normalizeTeam(homeC),
    away: normalizeTeam(awayC),
    homeScore,
    awayScore,
    winnerTeamId,
    network: national ?? anyBroadcast ?? null,
    venue: comp.venue?.fullName ?? null,
    spread: comp.odds?.[0]?.details ?? null,
    overUnder: comp.odds?.[0]?.overUnder ?? null,
    winProbability: impliedFromOdds(comp.odds?.[0]),
  };
}

export function normalizeSlate(
  data: EspnScoreboard,
  fallback: { season: number; seasonType: number; week: number },
): WeekSlate {
  const season = data.season?.year ?? fallback.season;
  const seasonType = data.season?.type ?? fallback.seasonType;
  const week = data.week?.number ?? fallback.week;

  const games = (data.events ?? [])
    .map((e) => normalizeGame(e, { season, seasonType, week }))
    .filter((g): g is Game => g !== null)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id));

  return {
    meta: {
      season,
      seasonType,
      week,
      teamsOnBye: (data.week?.teamsOnBye ?? []).map((t) => ({
        id: t.id,
        abbreviation: t.abbreviation ?? "",
        displayName: t.displayName ?? t.abbreviation ?? "",
        logo: t.logo ?? "",
      })),
    },
    games,
  };
}

function normalizeStatus(raw: string | undefined): InjuryStatus {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("injured reserve") || s === "ir") return "Injured Reserve";
  if (s.startsWith("out")) return "Out";
  if (s.startsWith("doubtful")) return "Doubtful";
  if (s.startsWith("questionable")) return "Questionable";
  if (s.includes("suspend")) return "Suspension";
  if (s.includes("day")) return "Day-To-Day";
  return "Other";
}

function normalizeInjury(entry: EspnInjuryEntry): Injury | null {
  const a = entry.athlete;
  if (!a?.id) return null;
  const pos = a.position?.abbreviation ?? "";
  const detail = entry.details?.type;
  return {
    athleteId: a.id,
    name: a.displayName ?? a.shortName ?? "Unknown",
    position: pos,
    status: normalizeStatus(entry.status),
    detail: detail && detail !== "Undisclosed" ? detail : null,
    returnDate: entry.details?.returnDate ?? null,
    keyPosition: KEY_POSITIONS.has(pos.toUpperCase()),
  };
}

/**
 * Sorted so the names that matter surface first: key positions before depth
 * players, and within that, most severe status first.
 */
export function normalizeInjuries(summary: EspnSummary, teamId: string): Injury[] {
  const block = summary.injuries?.find((i) => i.team?.id === teamId);
  if (!block?.injuries?.length) return [];
  return block.injuries
    .map(normalizeInjury)
    .filter((i): i is Injury => i !== null)
    .sort((a, b) => {
      if (a.keyPosition !== b.keyPosition) return a.keyPosition ? -1 : 1;
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name);
    });
}

/** ESPN's own model, when it has published one for this matchup. */
export function predictorProbability(summary: EspnSummary, homeId: string, awayId: string): WinProbability | null {
  const p = summary.predictor;
  if (!p) return null;
  const homeRaw = p.homeTeam?.id === homeId ? p.homeTeam?.gameProjection : p.awayTeam?.id === homeId ? p.awayTeam?.gameProjection : undefined;
  const awayRaw = p.awayTeam?.id === awayId ? p.awayTeam?.gameProjection : p.homeTeam?.id === awayId ? p.homeTeam?.gameProjection : undefined;
  const home = Number(homeRaw);
  const away = Number(awayRaw);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return {
    home: Math.round(home * 10) / 10,
    away: Math.round(away * 10) / 10,
    source: "ESPN matchup predictor",
  };
}

export function normalizeLastFive(summary: EspnSummary, teamId: string): LastFiveGame[] {
  const block = summary.lastFiveGames?.find((b) => b.team?.id === teamId);
  return (block?.events ?? []).slice(0, 5).map((e) => ({
    opponent: e.opponent?.abbreviation ?? e.opponent?.displayName ?? "",
    opponentLogo: e.opponent?.logo ?? null,
    atVs: e.atVs ?? "vs",
    result: e.gameResult ?? "",
    score: e.score ?? "",
    date: e.gameDate ?? "",
  }));
}

function findStat(data: EspnTeamStats, category: string, name: string): string | null {
  const cat = data.splits?.categories?.find((c) => c.name === category);
  const stat = cat?.stats?.find((s) => s.name === name);
  return stat?.displayValue ?? null;
}

export function normalizeTeamStats(data: EspnTeamStats, teamId: string, season: number): TeamSeasonStats {
  const pct = (v: string | null) => {
    if (v === null) return null;
    const n = Number(v.replace("%", ""));
    return Number.isFinite(n) ? `${n.toFixed(1)}%` : null;
  };
  return {
    teamId,
    season,
    pointsPerGame: findStat(data, "scoring", "totalPointsPerGame") ?? findStat(data, "passing", "totalPointsPerGame"),
    // The statistics endpoint reports points-allowed as 0; the record endpoint
    // supplies the real number and is folded in by the caller.
    pointsAllowedPerGame: null,
    yardsPerGame: findStat(data, "passing", "yardsPerGame"),
    passYardsPerGame: findStat(data, "passing", "passingYardsPerGame"),
    rushYardsPerGame: findStat(data, "rushing", "rushingYardsPerGame"),
    turnoverDifferential: findStat(data, "miscellaneous", "turnOverDifferential"),
    thirdDownPct: pct(findStat(data, "miscellaneous", "thirdDownConvPct")),
    redZoneScorePct: pct(findStat(data, "miscellaneous", "redzoneScoringPct")),
  };
}

/** Same-season points for/against per game, plus the overall record summary. */
export function normalizeTeamRecord(data: EspnTeamRecord): {
  summary: string | null;
  pointsPerGame: string | null;
  pointsAllowedPerGame: string | null;
} | null {
  const total = data.items?.find((i) => i.type === "total") ?? data.items?.[0];
  if (!total) return null;
  const stat = (name: string) => {
    const v = total.stats?.find((s) => s.name === name)?.value;
    return typeof v === "number" && Number.isFinite(v) ? v.toFixed(1) : null;
  };
  return {
    summary: total.summary ?? null,
    pointsPerGame: stat("avgPointsFor"),
    pointsAllowedPerGame: stat("avgPointsAgainst"),
  };
}
