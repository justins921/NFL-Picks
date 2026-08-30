"use client";

import { useState } from "react";
import { formatStreak, type StandingsRow } from "@/lib/types";

type SortKey = "wins" | "winPct" | "streak" | "name";

export function StandingsTable({ rows, meId }: { rows: StandingsRow[]; meId: number }) {
  const [sort, setSort] = useState<SortKey>("wins");

  const sorted = [...rows].sort((a, b) => {
    switch (sort) {
      case "winPct":
        return b.winPct - a.winPct || b.wins - a.wins;
      case "streak":
        return b.streak - a.streak || b.wins - a.wins;
      case "name":
        return a.name.localeCompare(b.name);
      default:
        return b.wins - a.wins || a.losses - b.losses;
    }
  });

  const header = (key: SortKey, label: string, className: string) => (
    <th className={className}>
      <button
        type="button"
        onClick={() => setSort(key)}
        className={`min-h-9 px-1 font-bold ${sort === key ? "text-chalk underline" : "text-muted"}`}
      >
        {label}
      </button>
    </th>
  );

  const nobodyHasPlayed = rows.every((r) => r.wins + r.losses + r.pushes === 0);

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface/60">
      <table className="w-full min-w-[22rem] text-sm">
        <thead className="border-b border-line text-xs">
          <tr>
            <th className="w-8 py-1 text-center font-bold text-muted">#</th>
            {header("name", "Name", "py-1 text-left")}
            {header("wins", "W-L", "py-1 text-right")}
            {header("winPct", "Pct", "py-1 text-right")}
            {header("streak", "Streak", "py-1 text-right pr-3")}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/60">
          {sorted.map((row, i) => (
            <tr key={row.userId} className={row.userId === meId ? "bg-chalk/5" : undefined}>
              <td className="py-2.5 text-center text-xs text-muted tabular-nums">{i + 1}</td>
              <td className="py-2.5">
                <span className="font-bold">{row.name}</span>
                {row.userId === meId ? <span className="ml-1.5 text-xs text-muted">you</span> : null}
                {row.pending > 0 ? (
                  <span className="ml-1.5 text-xs text-muted tabular-nums">· {row.pending} pending</span>
                ) : null}
              </td>
              <td className="py-2.5 text-right font-bold tabular-nums">
                {row.wins}-{row.losses}
                {row.pushes > 0 ? `-${row.pushes}` : ""}
              </td>
              <td className="py-2.5 text-right text-muted tabular-nums">
                {row.wins + row.losses === 0 ? "–" : row.winPct.toFixed(3).replace(/^0/, "")}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums">
                <span
                  className={
                    row.streak > 0 ? "text-win" : row.streak < 0 ? "text-loss" : "text-muted"
                  }
                >
                  {formatStreak(row.streak)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {nobodyHasPlayed ? (
        <p className="border-t border-line px-4 py-4 text-center text-xs text-muted">
          Nothing graded yet — standings fill in as games finish.
        </p>
      ) : null}
    </div>
  );
}
