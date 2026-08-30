"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useOptimistic, useTransition } from "react";
import { makePick, type PickActionState } from "@/app/actions";
import { formatTime } from "@/lib/format";
import type { Game, PickResult, Team } from "@/lib/types";

interface Props {
  game: Game;
  pickedTeamId: string | null;
  locked: boolean;
  result: PickResult;
  /**
   * Who picked this team, for locked games only. The server sends nothing at
   * all for a game that hasn't kicked off, so there is no hidden data here to
   * be dug out of the page.
   */
  revealed?: { home: string[]; away: string[] } | null;
}

function scoreline(game: Game, team: Team): string | null {
  if (game.state === "pre") return null;
  const score = team.id === game.home.id ? game.homeScore : game.awayScore;
  return score === null ? null : String(score);
}

/** The colour band that tells you at a glance how a finished pick went. */
function resultStyles(result: PickResult, isPicked: boolean): string {
  if (!isPicked) return "border-line bg-surface";
  switch (result) {
    case "win":
      return "border-win bg-win/15";
    case "loss":
      return "border-loss bg-loss/15";
    case "push":
      return "border-warn bg-warn/15";
    default:
      return "border-chalk bg-chalk/10";
  }
}

function TeamRow({
  game,
  team,
  isPicked,
  locked,
  result,
  onPick,
  pending,
  pickedBy,
}: {
  game: Game;
  team: Team;
  isPicked: boolean;
  locked: boolean;
  result: PickResult;
  onPick: () => void;
  pending: boolean;
  pickedBy: string[];
}) {
  const score = scoreline(game, team);
  const isWinner = game.completed && game.winnerTeamId === team.id;
  const record = team.record;
  const prob =
    game.winProbability &&
    (team.id === game.home.id ? game.winProbability.home : game.winProbability.away);

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={locked || pending}
      aria-pressed={isPicked}
      aria-label={`Pick ${team.displayName} to win`}
      className={`flex min-h-16 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition active:scale-[0.99] disabled:active:scale-100 ${resultStyles(
        result,
        isPicked,
      )} ${locked ? "cursor-default" : ""}`}
    >
      <Image
        src={team.logo}
        alt=""
        width={36}
        height={36}
        className={`size-9 shrink-0 ${game.completed && !isWinner ? "opacity-45" : ""}`}
        unoptimized
      />

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={`truncate font-bold ${isWinner ? "text-chalk" : ""}`}>{team.shortName}</span>
          {isPicked ? (
            <span className="shrink-0 rounded-full bg-chalk px-2 py-0.5 text-[10px] font-black text-field uppercase">
              Pick
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 flex gap-2 text-xs text-muted tabular-nums">
          {record ? <span>{record}</span> : null}
          {prob != null ? <span>{prob}%</span> : null}
        </span>
        {pickedBy.length > 0 ? (
          <span className="mt-1 flex flex-wrap gap-1">
            {pickedBy.map((name) => (
              <span
                key={name}
                className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted"
              >
                {name}
              </span>
            ))}
          </span>
        ) : null}
      </span>

      {score !== null ? (
        <span className={`shrink-0 text-2xl font-black tabular-nums ${isWinner ? "" : "text-muted"}`}>
          {score}
        </span>
      ) : null}
    </button>
  );
}

export function GameCard({ game, pickedTeamId, locked, result, revealed }: Props) {
  const [state, formAction] = useActionState<PickActionState, FormData>(makePick, { error: null });
  const [isPending, startTransition] = useTransition();
  const [optimisticPick, setOptimisticPick] = useOptimistic(pickedTeamId);

  const pick = (teamId: string) => {
    if (locked) return;
    const data = new FormData();
    data.set("gameId", game.id);
    data.set("teamId", teamId);
    data.set("season", String(game.season));
    data.set("seasonType", String(game.seasonType));
    data.set("week", String(game.week));

    startTransition(() => {
      setOptimisticPick(teamId);
      formAction(data);
    });
  };

  const statusText = game.completed
    ? game.statusDetail || "Final"
    : game.state === "in"
      ? game.statusDetail
      : formatTime(game.kickoff);

  return (
    <article className="rounded-2xl border border-line bg-surface/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
          <span className={`font-semibold ${game.state === "in" ? "text-warn" : ""}`}>{statusText}</span>
          {game.network ? <span className="truncate">· {game.network}</span> : null}
          {game.spread && !game.completed ? <span className="truncate">· {game.spread}</span> : null}
        </div>

        <Link
          href={`/game/${game.id}`}
          className="shrink-0 rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted active:bg-surface-2"
        >
          Details
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        <TeamRow
          game={game}
          team={game.away}
          isPicked={optimisticPick === game.away.id}
          locked={locked}
          result={result}
          onPick={() => pick(game.away.id)}
          pending={isPending}
          pickedBy={revealed?.away ?? []}
        />
        <TeamRow
          game={game}
          team={game.home}
          isPicked={optimisticPick === game.home.id}
          locked={locked}
          result={result}
          onPick={() => pick(game.home.id)}
          pending={isPending}
          pickedBy={revealed?.home ?? []}
        />
      </div>

      {locked && !optimisticPick ? (
        <p className="mt-2 px-1 text-xs text-muted">Locked — no pick made.</p>
      ) : null}
      {!locked ? (
        <p className="mt-2 px-1 text-xs text-muted">
          Everyone&apos;s picks show here at kickoff.
        </p>
      ) : null}
      {state.error ? <p className="mt-2 px-1 text-xs text-loss">{state.error}</p> : null}
    </article>
  );
}
