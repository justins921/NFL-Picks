/** Shared by client components — keep this free of server-only imports. */

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [80, 80, 80];
}

function distance(a: string, b: string): number {
  const [r1, g1, b1] = toRgb(a);
  const [r2, g2, b2] = toRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/**
 * Several matchups pit two teams with near-identical primaries against each
 * other (Patriots and Seahawks are both navy). When that happens the split bar
 * reads as one solid block, so fall back to each team's alternate colour.
 */
export function distinguishColors(
  away: { color: string; altColor: string },
  home: { color: string; altColor: string },
): { away: string; home: string } {
  const TOO_CLOSE = 60;
  if (distance(away.color, home.color) >= TOO_CLOSE) {
    return { away: away.color, home: home.color };
  }
  if (distance(away.altColor, home.color) >= TOO_CLOSE) {
    return { away: away.altColor, home: home.color };
  }
  if (distance(away.color, home.altColor) >= TOO_CLOSE) {
    return { away: away.color, home: home.altColor };
  }
  return { away: away.altColor, home: home.altColor };
}
