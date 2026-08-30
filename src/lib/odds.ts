/**
 * American moneyline -> implied probability, with the vig removed so the two
 * sides add to 100%. These are book prices, not a model, and the UI labels
 * them that way.
 */

export function americanToImplied(odds: number): number {
  if (odds === 0 || Number.isNaN(odds)) return NaN;
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

export function parseAmerican(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[+\s]/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/**
 * Removes the bookmaker's margin by scaling both implied probabilities so they
 * sum to 1. Returns percentages rounded to one decimal.
 */
export function devig(homeOdds: number, awayOdds: number): { home: number; away: number } | null {
  const h = americanToImplied(homeOdds);
  const a = americanToImplied(awayOdds);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  const total = h + a;
  if (total <= 0) return null;
  return {
    home: Math.round((h / total) * 1000) / 10,
    away: Math.round((a / total) * 1000) / 10,
  };
}
