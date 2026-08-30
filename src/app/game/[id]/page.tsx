import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { InjuryList } from "@/components/InjuryList";
import { WinProbabilityBar } from "@/components/WinProbabilityBar";
import { getCurrentUser, hasFamilyAccess } from "@/lib/auth";
import { getGameDetail, isLocked } from "@/lib/espn/season";
import { formatKickoff } from "@/lib/format";
import { getPicksForGames, gradePick } from "@/lib/picks";
import type { LastFiveGame, Team, TeamSeasonStats } from "@/lib/types";

export const dynamic = "force-dynamic";

const STAT_ROWS: { label: string; key: keyof TeamSeasonStats }[] = [
  { label: "Points / game", key: "pointsPerGame" },
  { label: "Points allowed / game", key: "pointsAllowedPerGame" },
  { label: "Total yards / game", key: "yardsPerGame" },
  { label: "Pass yards / game", key: "passYardsPerGame" },
  { label: "Rush yards / game", key: "rushYardsPerGame" },
  { label: "Turnover margin", key: "turnoverDifferential" },
  { label: "3rd down", key: "thirdDownPct" },
  { label: "Red zone score %", key: "redZoneScorePct" },
];

function TeamHeading({ team, score, isWinner, side }: { team: Team; score: number | null; isWinner: boolean; side: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
      <Image src={team.logo} alt="" width={56} height={56} className="size-14" unoptimized />
      <div className="text-xs font-bold text-muted uppercase">{side}</div>
      <div className="text-sm leading-tight font-bold">{team.displayName}</div>
      <div className="text-xs text-muted tabular-nums">{team.record ?? "0-0"}</div>
      {score !== null ? (
        <div className={`text-4xl font-black tabular-nums ${isWinner ? "" : "text-muted"}`}>{score}</div>
      ) : null}
    </div>
  );
}

function LastFive({ games }: { games: LastFiveGame[] }) {
  if (games.length === 0) return <p className="text-xs text-muted">No recent games.</p>;
  return (
    <ul className="flex flex-col gap-1">
      {games.map((g, i) => (
        <li key={`${g.date}-${i}`} className="flex items-center gap-2 text-xs">
          <span
            className={`flex size-5 shrink-0 items-center justify-center rounded font-black ${
              g.result === "W" ? "bg-win/20 text-win" : g.result === "L" ? "bg-loss/20 text-loss" : "bg-surface-2 text-muted"
            }`}
          >
            {g.result || "–"}
          </span>
          <span className="text-muted">{g.atVs}</span>
          <span className="font-semibold">{g.opponent}</span>
          <span className="ml-auto text-muted tabular-nums">{g.score}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function GameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await hasFamilyAccess())) redirect("/login");
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const detail = await getGameDetail(id);
  if (!detail) notFound();

  const { game, injuries, stats, lastFive } = detail;
  const locked = isLocked(game);

  const myPick = (await getPicksForGames([game.id])).find((p) => p.userId === user.id) ?? null;
  const result = myPick ? gradePick(myPick.pickedTeamId, game) : "pending";
  const pickedTeam =
    myPick?.pickedTeamId === game.home.id ? game.home : myPick?.pickedTeamId === game.away.id ? game.away : null;

  const statsSeason = stats.home?.season ?? stats.away?.season ?? null;
  const statsAreLastSeason = statsSeason !== null && statsSeason < game.season;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-field/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
          <Link
            href={`/?week=${game.week}`}
            className="flex min-h-9 items-center rounded-full border border-line px-3 text-xs font-semibold text-muted active:bg-surface"
          >
            ‹ Week {game.week}
          </Link>
          <span className="truncate text-sm font-bold">
            {game.away.abbreviation} @ {game.home.abbreviation}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        <section className="rounded-2xl border border-line bg-surface/60 p-4">
          <div className="flex items-start gap-2">
            <TeamHeading
              team={game.away}
              score={game.state === "pre" ? null : game.awayScore}
              isWinner={game.winnerTeamId === game.away.id}
              side="Away"
            />
            <div className="flex flex-col items-center gap-1 self-center px-2 text-center">
              <span className="text-xs font-black text-muted">
                {game.completed ? "FINAL" : game.state === "in" ? "LIVE" : "@"}
              </span>
            </div>
            <TeamHeading
              team={game.home}
              score={game.state === "pre" ? null : game.homeScore}
              isWinner={game.winnerTeamId === game.home.id}
              side="Home"
            />
          </div>

          <div className="mt-3 space-y-0.5 border-t border-line pt-3 text-center text-xs text-muted">
            <p>{game.completed ? game.statusDetail || "Final" : formatKickoff(game.kickoff)}</p>
            <p>
              {[game.venue, game.network].filter(Boolean).join(" · ")}
              {game.spread && !game.completed ? ` · ${game.spread}` : ""}
              {game.overUnder && !game.completed ? ` · O/U ${game.overUnder}` : ""}
            </p>
          </div>

          {pickedTeam ? (
            <p
              className={`mt-3 rounded-xl border px-3 py-2 text-center text-sm font-semibold ${
                result === "win"
                  ? "border-win/40 bg-win/15 text-win"
                  : result === "loss"
                    ? "border-loss/40 bg-loss/15 text-loss"
                    : result === "push"
                      ? "border-warn/40 bg-warn/15 text-warn"
                      : "border-line bg-surface-2 text-chalk"
              }`}
            >
              You picked {pickedTeam.shortName}
              {result === "win" ? " — nice call." : result === "loss" ? " — no dice." : result === "push" ? " — push." : locked ? " (locked)" : ""}
            </p>
          ) : locked ? (
            <p className="mt-3 rounded-xl border border-line bg-surface-2 px-3 py-2 text-center text-sm text-muted">
              No pick made — this one locked at kickoff.
            </p>
          ) : (
            <Link
              href={`/?week=${game.week}`}
              className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-chalk text-sm font-bold text-field"
            >
              Make your pick
            </Link>
          )}
        </section>

        <section className="mt-4 rounded-2xl border border-line bg-surface/60 p-4">
          <h2 className="mb-3 text-sm font-bold">Win probability</h2>
          <WinProbabilityBar
            probability={game.winProbability}
            home={game.home}
            away={game.away}
            frozen={detail.snapshotted}
          />
        </section>

        <section className="mt-4 rounded-2xl border border-line bg-surface/60 p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold">Season stats</h2>
            {statsSeason ? (
              <span className="text-xs text-muted">
                {statsAreLastSeason ? `${statsSeason} season` : `${statsSeason}`}
              </span>
            ) : null}
          </div>

          {stats.home || stats.away ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="w-14 py-1 text-left font-bold">{game.away.abbreviation}</th>
                  <th className="py-1 text-center font-normal"></th>
                  <th className="w-14 py-1 text-right font-bold">{game.home.abbreviation}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {STAT_ROWS.map((row) => (
                  <tr key={row.key}>
                    <td className="py-1.5 text-left font-semibold tabular-nums">
                      {(stats.away?.[row.key] as string | null) ?? "–"}
                    </td>
                    <td className="py-1.5 text-center text-xs text-muted">{row.label}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">
                      {(stats.home?.[row.key] as string | null) ?? "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">Season stats unavailable.</p>
          )}
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface/60 p-4">
            <h2 className="mb-1 text-sm font-bold">{game.away.shortName} last 5</h2>
            <p className="mb-2 text-xs text-muted">Road record {game.away.awayRecord ?? "–"}</p>
            <LastFive games={lastFive.away} />
          </div>
          <div className="rounded-2xl border border-line bg-surface/60 p-4">
            <h2 className="mb-1 text-sm font-bold">{game.home.shortName} last 5</h2>
            <p className="mb-2 text-xs text-muted">Home record {game.home.homeRecord ?? "–"}</p>
            <LastFive games={lastFive.home} />
          </div>
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface/60 p-4">
            <h2 className="mb-2 text-sm font-bold">{game.away.shortName} injuries</h2>
            <InjuryList injuries={injuries.away} available={detail.injuriesAvailable} />
          </div>
          <div className="rounded-2xl border border-line bg-surface/60 p-4">
            <h2 className="mb-2 text-sm font-bold">{game.home.shortName} injuries</h2>
            <InjuryList injuries={injuries.home} available={detail.injuriesAvailable} />
          </div>
        </section>

        {detail.snapshotted ? (
          <p className="mt-4 px-1 text-xs text-muted">
            Win probability and the injury report were saved as they stood at kickoff.
          </p>
        ) : null}
      </main>

      <BottomNav isAdmin={user.isAdmin} />
    </div>
  );
}
