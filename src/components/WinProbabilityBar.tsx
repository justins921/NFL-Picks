import { distinguishColors } from "@/lib/colors";
import type { Team, WinProbability } from "@/lib/types";

export function WinProbabilityBar({
  probability,
  home,
  away,
  frozen,
}: {
  probability: WinProbability | null;
  home: Team;
  away: Team;
  frozen: boolean;
}) {
  if (!probability) {
    return (
      <p className="text-sm text-muted">Win probability unavailable for this game.</p>
    );
  }

  const bar = distinguishColors(away, home);

  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-muted">{away.abbreviation}</div>
          <div className="text-2xl font-black tabular-nums">{probability.away}%</div>
        </div>
        <div className="text-right">
          <div className="text-xs font-bold text-muted">{home.abbreviation}</div>
          <div className="text-2xl font-black tabular-nums">{probability.home}%</div>
        </div>
      </div>

      <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full"
          style={{ width: `${probability.away}%`, background: bar.away }}
          aria-hidden
        />
        <div
          className="h-full flex-1"
          style={{ background: bar.home }}
          aria-hidden
        />
      </div>

      <p className="mt-2 text-xs text-muted">
        {probability.source}
        {frozen ? " · frozen at kickoff" : ""}
      </p>
    </div>
  );
}
