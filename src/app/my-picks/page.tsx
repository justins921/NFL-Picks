import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";
import { WeekSelector } from "@/components/WeekSelector";
import { db } from "@/db";
import { games as gamesTable } from "@/db/schema";
import { getCurrentUser, hasFamilyAccess } from "@/lib/auth";
import { WEEKS_IN_REGULAR_SEASON } from "@/lib/constants";
import { getCurrentWeek, getWeekSlate, isLocked, REGULAR_SEASON } from "@/lib/espn/season";
import { formatKickoff } from "@/lib/format";
import { getPicksForWeek, getStandings, gradePick, type PickResult } from "@/lib/picks";

export const dynamic = "force-dynamic";

const RESULT_STYLES: Record<PickResult, string> = {
  win: "border-win/40 bg-win/10",
  loss: "border-loss/40 bg-loss/10",
  push: "border-warn/40 bg-warn/10",
  pending: "border-line bg-surface/60",
};

const RESULT_LABEL: Record<PickResult, string> = {
  win: "Win",
  loss: "Loss",
  push: "Push",
  pending: "",
};

function parseWeek(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= WEEKS_IN_REGULAR_SEASON ? n : fallback;
}

export default async function MyPicksPage({
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
  const myPicks = getPicksForWeek(user.id, season, REGULAR_SEASON, week);
  const pickByGame = new Map(myPicks.map((p) => [p.gameId, p.pickedTeamId]));

  const cached = db
    .select()
    .from(gamesTable)
    .where(and(eq(gamesTable.season, season), eq(gamesTable.seasonType, REGULAR_SEASON), eq(gamesTable.week, week)))
    .all();
  const cachedById = new Map(cached.map((g) => [g.id, g]));

  const standings = getStandings(season, REGULAR_SEASON);
  const me = standings.find((r) => r.userId === user.id);
  const weekRecord = me?.weeklyRecords.find((w) => w.week === week);

  const missing = slate.games.filter((g) => !pickByGame.has(g.id) && !isLocked(g));

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        user={user}
        record={{ wins: me?.wins ?? 0, losses: me?.losses ?? 0, pushes: me?.pushes ?? 0 }}
      />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        <h1 className="mb-3 text-2xl font-black tracking-tight">My Picks</h1>

        <WeekSelector week={week} currentWeek={current.week} basePath="/my-picks" />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface/50 px-4 py-3 text-sm">
          <span className="tabular-nums">
            <span className="font-bold">
              {pickByGame.size} of {slate.games.length}
            </span>{" "}
            <span className="text-muted">picked</span>
          </span>
          {weekRecord ? (
            <span className="text-muted tabular-nums">
              Week {week}: {weekRecord.wins}-{weekRecord.losses}
              {weekRecord.pushes > 0 ? `-${weekRecord.pushes}` : ""}
            </span>
          ) : null}
        </div>

        {missing.length > 0 ? (
          <Link
            href={`/?week=${week}`}
            className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-chalk text-sm font-bold text-field"
          >
            {missing.length} game{missing.length === 1 ? "" : "s"} still to pick
          </Link>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          {slate.games.map((game) => {
            const pickedId = pickByGame.get(game.id) ?? null;
            const row = cachedById.get(game.id);
            const result: PickResult = pickedId
              ? gradePick(pickedId, {
                  completed: row?.completed ?? game.completed,
                  winnerTeamId: row?.winnerTeamId ?? game.winnerTeamId,
                })
              : "pending";
            const picked =
              pickedId === game.home.id ? game.home : pickedId === game.away.id ? game.away : null;
            const locked = isLocked(game);

            return (
              <Link
                key={game.id}
                href={`/game/${game.id}`}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${RESULT_STYLES[result]}`}
              >
                {picked ? (
                  <Image src={picked.logo} alt="" width={32} height={32} className="size-8 shrink-0" unoptimized />
                ) : (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-line text-xs text-muted">
                    ?
                  </span>
                )}

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {game.away.abbreviation} @ {game.home.abbreviation}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {picked ? `You picked ${picked.shortName}` : locked ? "No pick made" : "Not picked yet"}
                    {" · "}
                    {game.completed ? game.statusDetail || "Final" : formatKickoff(game.kickoff)}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  {RESULT_LABEL[result] ? (
                    <span
                      className={`text-xs font-black uppercase ${
                        result === "win" ? "text-win" : result === "loss" ? "text-loss" : "text-warn"
                      }`}
                    >
                      {RESULT_LABEL[result]}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-muted">
                      {locked ? "Locked" : "Open"}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>

        {slate.games.length === 0 ? (
          <p className="mt-6 rounded-xl border border-line bg-surface/50 px-4 py-8 text-center text-sm text-muted">
            No games scheduled for Week {week}.
          </p>
        ) : null}
      </main>

      <BottomNav isAdmin={user.isAdmin} />
    </div>
  );
}
