"use client";

import { useRouter } from "next/navigation";
import { WEEKS_IN_REGULAR_SEASON } from "@/lib/constants";

interface Props {
  week: number;
  currentWeek: number;
  basePath?: string;
}

export function WeekSelector({ week, currentWeek, basePath = "/" }: Props) {
  const router = useRouter();
  const weeks = Array.from({ length: WEEKS_IN_REGULAR_SEASON }, (_, i) => i + 1);

  const go = (next: number) => {
    if (next < 1 || next > WEEKS_IN_REGULAR_SEASON) return;
    router.push(next === currentWeek ? basePath : `${basePath}?week=${next}`);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => go(week - 1)}
        disabled={week <= 1}
        aria-label="Previous week"
        className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-xl disabled:opacity-30"
      >
        ‹
      </button>

      <label className="relative flex-1">
        <span className="sr-only">Week</span>
        <select
          value={week}
          onChange={(e) => go(Number(e.target.value))}
          className="min-h-11 w-full appearance-none rounded-xl border border-line bg-surface px-4 text-center text-base font-bold outline-none"
        >
          {weeks.map((w) => (
            <option key={w} value={w}>
              Week {w}
              {w === currentWeek ? " · current" : ""}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => go(week + 1)}
        disabled={week >= WEEKS_IN_REGULAR_SEASON}
        aria-label="Next week"
        className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-xl disabled:opacity-30"
      >
        ›
      </button>
    </div>
  );
}
