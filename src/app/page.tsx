import Image from "next/image";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { GameCard } from "@/components/GameCard";
import { Header } from "@/components/Header";
import { WeekSelector } from "@/components/WeekSelector";
import { hasFamilyAccess, getCurrentUser } from "@/lib/auth";
import { getCurrentWeek, getWeekSlate, isLocked, REGULAR_SEASON } from "@/lib/espn/season";
import { centralDayKey, formatDayHeading } from "@/lib/format";
import { getPicksForWeek, getStandings, gradePick } from "@/lib/picks";
import { db } from "@/db";
import { games as gamesTable } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { WEEKS_IN_REGULAR_SEASON } from "@/lib/constants";
import type { Game } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseWeek(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= WEEKS_IN_REGULAR_SEASON ? n : fallback;
}

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  if (!(await hasFamilyAccess())) redirect("/login");
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const current = await getCurrentWeek();
  const week = parseWeek(params.week, current.week);
  const season = current.season;

  const slate = await getWeekSlate(season, REGULAR_SEASON, week);

  const myPicks = await getPicksForWeek(user.id, season, REGULAR_SEASON, week);
  const pickByGame = new Map(myPicks.map((p) => [p.gameId, p.pickedTeamId]));

  // Grade against our own cached rows so results survive an ESPN outage.
  const cachedGames = await db
    .select()
    .from(gamesTable)
    .where(and(eq(gamesTable.season, season), eq(gamesTable.seasonType, REGULAR_SEASON), eq(gamesTable.week, week)));
  const cachedById = new Map(cachedGames.map((g) => [g.id, g]));

  const standings = await getStandings(season, REGULAR_SEASON);
  const myRow = standings.find((r) => r.userId === user.id);

  const openGames = slate.games.filter((g) => !isLocked(g));
  const madeOnOpen = openGames.filter((g) => pickByGame.has(g.id)).length;
  const totalPicked = slate.games.filter((g) => pickByGame.has(g.id)).length;

  // Group by Central-time day so the slate reads like a TV schedule.
  const days = new Map<string, Game[]>();
  for (const game of slate.games) {
    const key = centralDayKey(game.kickoff);
    const list = days.get(key) ?? [];
    list.push(game);
    days.set(key, list);
  }

  const seasonStarted = slate.games.some((g) => g.state !== "pre");

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        user={user}
        record={{ wins: myRow?.wins ?? 0, losses: myRow?.losses ?? 0, pushes: myRow?.pushes ?? 0 }}
      />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        <WeekSelector week={week} currentWeek={current.week} />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface/50 px-4 py-3">
          <p className="text-sm">
            <span className="font-bold tabular-nums">
              {totalPicked} of {slate.games.length}
            </span>{" "}
            <span className="text-muted">games picked</span>
          </p>
          {openGames.length > 0 ? (
            <p className="text-xs text-muted tabular-nums">
              {openGames.length - madeOnOpen === 0
                ? "You're all set for the games still open."
                : `${openGames.length - madeOnOpen} still open`}
            </p>
          ) : slate.games.length > 0 && !seasonStarted ? null : (
            <p className="text-xs text-muted">All games locked</p>
          )}
        </div>

        {week === 1 && !seasonStarted && slate.games.length > 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-surface/40 px-4 py-3 text-sm text-muted">
            Week 1 hasn&apos;t kicked off yet — get your picks in early.
          </p>
        ) : null}

        {slate.games.length === 0 ? (
          <p className="mt-6 rounded-xl border border-line bg-surface/50 px-4 py-8 text-center text-sm text-muted">
            No games found for Week {week}. The schedule may not be posted yet.
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-6">
          {[...days.entries()].map(([key, dayGames]) => (
            <section key={key}>
              <h2 className="mb-2 px-1 text-sm font-bold text-muted">
                {formatDayHeading(dayGames[0].kickoff)}
              </h2>
              <div className="flex flex-col gap-3">
                {dayGames.map((game) => {
                  const cached = cachedById.get(game.id);
                  const picked = pickByGame.get(game.id) ?? null;
                  return (
                    <GameCard
                      key={game.id}
                      game={game}
                      pickedTeamId={picked}
                      locked={isLocked(game)}
                      result={
                        picked
                          ? gradePick(picked, {
                              completed: cached?.completed ?? game.completed,
                              winnerTeamId: cached?.winnerTeamId ?? game.winnerTeamId,
                            })
                          : "pending"
                      }
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {slate.meta.teamsOnBye.length > 0 ? (
          <section className="mt-6">
            <h2 className="mb-2 px-1 text-sm font-bold text-muted">On bye</h2>
            <div className="flex flex-wrap gap-2 rounded-xl border border-line bg-surface/40 p-3">
              {slate.meta.teamsOnBye.map((team) => (
                <span
                  key={team.id}
                  className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs font-semibold"
                >
                  {team.logo ? (
                    <Image src={team.logo} alt="" width={18} height={18} className="size-4.5" unoptimized />
                  ) : null}
                  {team.abbreviation}
                </span>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <BottomNav isAdmin={user.isAdmin} />
    </div>
  );
}
