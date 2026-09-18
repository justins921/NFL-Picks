import type { Game } from "./types";

/**
 * True once kickoff has passed — picks are frozen from this moment.
 *
 * Deliberately dependency-free: both the pick logic and the ESPN layer need it,
 * and importing it from either would make those two modules circular.
 */
export function isLocked(game: Pick<Game, "kickoff" | "state">, now = Date.now()): boolean {
  if (game.state !== "pre") return true;
  const kickoff = new Date(game.kickoff).getTime();
  return Number.isFinite(kickoff) && now >= kickoff;
}
