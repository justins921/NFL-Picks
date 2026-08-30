import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { AddMemberForm } from "@/components/AddMemberForm";
import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";
import { db } from "@/db";
import { users } from "@/db/schema";
import { removeMember, signOut, toggleAdmin } from "@/app/actions";
import { getCurrentUser, hasFamilyAccess } from "@/lib/auth";
import { getCurrentWeek, REGULAR_SEASON } from "@/lib/espn/season";
import { getStandings } from "@/lib/picks";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await hasFamilyAccess())) redirect("/login");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/");

  const current = await getCurrentWeek();
  const rows = getStandings(current.season, REGULAR_SEASON);
  const me = rows.find((r) => r.userId === user.id);

  const active = db.select().from(users).where(eq(users.active, true)).all();
  const inactive = db.select().from(users).where(eq(users.active, false)).all();

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        user={user}
        record={{ wins: me?.wins ?? 0, losses: me?.losses ?? 0, pushes: me?.pushes ?? 0 }}
      />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        <h1 className="mb-1 text-2xl font-black tracking-tight">Family</h1>
        <p className="mb-4 text-sm text-muted">Add or remove who can make picks.</p>

        <section className="rounded-2xl border border-line bg-surface/60 p-4">
          <h2 className="mb-3 text-sm font-bold">Add someone</h2>
          <AddMemberForm />
        </section>

        <section className="mt-4 rounded-2xl border border-line bg-surface/60 p-4">
          <h2 className="mb-2 text-sm font-bold">Picking now ({active.length})</h2>
          <ul className="divide-y divide-line/60">
            {active.map((member) => (
              <li key={member.id} className="flex items-center gap-2 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="font-bold">{member.name}</span>
                  {member.isAdmin ? (
                    <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-[10px] font-bold text-muted uppercase">
                      Admin
                    </span>
                  ) : null}
                  {member.pin ? <span className="ml-2 text-xs text-muted">has PIN</span> : null}
                </span>

                <form action={toggleAdmin}>
                  <input type="hidden" name="userId" value={member.id} />
                  <button
                    type="submit"
                    className="min-h-9 rounded-lg border border-line px-2.5 text-xs font-semibold text-muted active:bg-surface-2"
                  >
                    {member.isAdmin ? "Remove admin" : "Make admin"}
                  </button>
                </form>

                {member.id === user.id ? null : (
                  <form action={removeMember}>
                    <input type="hidden" name="userId" value={member.id} />
                    <button
                      type="submit"
                      className="min-h-9 rounded-lg border border-loss/40 px-2.5 text-xs font-semibold text-loss active:bg-loss/10"
                    >
                      Remove
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>

        {inactive.length > 0 ? (
          <section className="mt-4 rounded-2xl border border-line bg-surface/60 p-4">
            <h2 className="mb-1 text-sm font-bold">Removed</h2>
            <p className="mb-2 text-xs text-muted">
              Their past picks still count toward finished weeks. Adding the same name back brings them in again.
            </p>
            <p className="text-sm text-muted">{inactive.map((m) => m.name).join(", ")}</p>
          </section>
        ) : null}

        <form action={signOut} className="mt-6">
          <button
            type="submit"
            className="min-h-12 w-full rounded-xl border border-line text-sm font-semibold text-muted active:bg-surface"
          >
            Sign out of this device
          </button>
        </form>
      </main>

      <BottomNav isAdmin={user.isAdmin} />
    </div>
  );
}
