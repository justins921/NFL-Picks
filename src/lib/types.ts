/**
 * Our own shapes. Everything ESPN returns gets normalized into these before it
 * reaches a component, so the UI never depends on ESPN's nested payloads.
 */

export type GameState = "pre" | "in" | "post";

export interface Team {
  id: string;
  abbreviation: string;
  displayName: string;
  shortName: string;
  location: string;
  nickname: string;
  color: string;
  altColor: string;
  logo: string;
  /** Overall record, e.g. "3-1" */
  record?: string;
  /** Home record, e.g. "2-0" */
  homeRecord?: string;
  /** Road record, e.g. "1-1" */
  awayRecord?: string;
}

export interface WinProbability {
  home: number;
  away: number;
  /** How we arrived at these numbers, shown verbatim to the user. */
  source: "ESPN matchup predictor" | "implied from odds, not a model";
}

export interface Game {
  id: string;
  season: number;
  seasonType: number;
  week: number;
  /** ISO 8601 UTC kickoff time. */
  kickoff: string;
  state: GameState;
  completed: boolean;
  /** e.g. "Final", "9/9 - 7:20 PM CT", "Q3 4:12" */
  statusDetail: string;
  home: Team;
  away: Team;
  homeScore: number | null;
  awayScore: number | null;
  /** ESPN team id of the winner, "TIE" for a tie, null if not decided. */
  winnerTeamId: string | null;
  network: string | null;
  venue: string | null;
  spread: string | null;
  overUnder: number | null;
  winProbability: WinProbability | null;
}

export interface WeekMeta {
  season: number;
  seasonType: number;
  week: number;
  teamsOnBye: { id: string; abbreviation: string; displayName: string; logo: string }[];
}

export interface WeekSlate {
  meta: WeekMeta;
  games: Game[];
}

export type InjuryStatus =
  | "Out"
  | "Doubtful"
  | "Questionable"
  | "Injured Reserve"
  | "Suspension"
  | "Day-To-Day"
  | "Other";

export interface Injury {
  athleteId: string;
  name: string;
  position: string;
  status: InjuryStatus;
  /** Short description of the injury, e.g. "Knee". Null when undisclosed. */
  detail: string | null;
  returnDate: string | null;
  /** True for QB/RB/WR/TE/LT/edge/CB — the ones a casual fan cares about. */
  keyPosition: boolean;
}

export interface TeamInjuries {
  teamId: string;
  injuries: Injury[];
}

export interface TeamSeasonStats {
  teamId: string;
  /** Season these numbers are from — may be last season if this one hasn't started. */
  season: number;
  pointsPerGame: string | null;
  pointsAllowedPerGame: string | null;
  yardsPerGame: string | null;
  passYardsPerGame: string | null;
  rushYardsPerGame: string | null;
  turnoverDifferential: string | null;
  thirdDownPct: string | null;
  redZoneScorePct: string | null;
}

export interface LastFiveGame {
  opponent: string;
  opponentLogo: string | null;
  atVs: string;
  result: string;
  score: string;
  date: string;
}

export interface GameDetail {
  game: Game;
  injuries: { home: Injury[]; away: Injury[] };
  injuriesAvailable: boolean;
  stats: { home: TeamSeasonStats | null; away: TeamSeasonStats | null };
  lastFive: { home: LastFiveGame[]; away: LastFiveGame[] };
  /** True when winProbability/injuries were frozen at kickoff rather than live. */
  snapshotted: boolean;
}

/* --- Pick + standings shapes. Kept here (not in lib/picks) because client
       components need them and lib/picks is server-only. --- */

export type PickResult = "win" | "loss" | "push" | "pending";

export interface StandingsRow {
  userId: number;
  name: string;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  winPct: number;
  /** Positive = win streak, negative = loss streak, 0 = none yet. */
  streak: number;
  weeklyRecords: { week: number; wins: number; losses: number; pushes: number }[];
}

/** e.g. "W3", "L2", or an em dash when nothing is decided yet. */
export function formatStreak(streak: number): string {
  if (streak === 0) return "—";
  return streak > 0 ? `W${streak}` : `L${Math.abs(streak)}`;
}
