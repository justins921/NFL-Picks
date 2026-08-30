import Link from "next/link";
import type { User } from "@/db/schema";
import { switchMember } from "@/app/actions";

interface Props {
  user: User;
  /** Season record shown next to the name, e.g. "12-4". */
  record: { wins: number; losses: number; pushes: number };
}

export function Header({ user, record }: Props) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-field/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-black tracking-tight">Pick&apos;em</span>
          {user.isAdmin ? (
            <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-bold text-muted uppercase">
              Admin
            </span>
          ) : null}
        </Link>

        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <div className="text-sm font-bold">{user.name}</div>
            <div className="text-xs text-muted tabular-nums">
              {record.wins}-{record.losses}
              {record.pushes > 0 ? `-${record.pushes}` : ""}
            </div>
          </div>
          <form action={switchMember}>
            <button
              type="submit"
              className="min-h-9 rounded-full border border-line px-3 text-xs font-semibold text-muted active:bg-surface"
            >
              Switch
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
