import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";
import { StandingsTable } from "@/components/StandingsTable";
import { getCurrentUser, hasFamilyAccess } from "@/lib/auth";
import { getCurrentWeek, REGULAR_SEASON } from "@/lib/espn/season";
import { getStandings } from "@/lib/picks";

export const dynamic = "force-dynamic";

export default async function StandingsPage() {
  if (!(await hasFamilyAccess())) redirect("/login");
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const current = await getCurrentWeek();
  const rows = getStandings(current.season, REGULAR_SEASON);
  const me = rows.find((r) => r.userId === user.id);

  // Weeks anyone has a graded result in, so the by-week grid stays compact.
  const weeks = [...new Set(rows.flatMap((r) => r.weeklyRecords.map((w) => w.week)))].sort((a, b) => a - b);

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        user={user}
        record={{ wins: me?.wins ?? 0, losses: me?.losses ?? 0, pushes: me?.pushes ?? 0 }}
      />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        <h1 className="mb-1 text-2xl font-black tracking-tight">Standings</h1>
        <p className="mb-4 text-sm text-muted">{current.season} season · straight-up picks</p>

        <StandingsTable rows={rows} meId={user.id} />

        {weeks.length > 0 ? (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-bold">By week</h2>
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface/60">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-xs text-muted">
                  <tr>
                    <th className="py-1 pl-3 text-left font-bold">Name</th>
                    {weeks.map((w) => (
                      <th key={w} className="px-2 py-1 text-center font-bold">
                        {w}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {rows.map((row) => (
                    <tr key={row.userId} className={row.userId === user.id ? "bg-chalk/5" : undefined}>
                      <td className="py-2 pl-3 font-semibold whitespace-nowrap">{row.name}</td>
                      {weeks.map((w) => {
                        const rec = row.weeklyRecords.find((r) => r.week === w);
                        return (
                          <td key={w} className="px-2 py-2 text-center text-xs tabular-nums">
                            {rec ? (
                              <span className={rec.wins > rec.losses ? "text-win" : rec.losses > rec.wins ? "text-loss" : ""}>
                                {rec.wins}-{rec.losses}
                              </span>
                            ) : (
                              <span className="text-muted">–</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <p className="mt-4 px-1 text-xs text-muted">
          Ties are a push — they don&apos;t count as a win or a loss for anyone.
        </p>
      </main>

      <BottomNav isAdmin={user.isAdmin} />
    </div>
  );
}
