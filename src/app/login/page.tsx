import { describeDbError } from "@/db";
import { hasFamilyAccess, listFamily } from "@/lib/auth";
import { FamilyPinForm } from "@/components/FamilyPinForm";
import { MemberPicker } from "@/components/MemberPicker";
import { SetupProblem } from "@/components/SetupProblem";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const unlocked = await hasFamilyAccess();

  // This is the first thing in the app that touches the database, so a
  // misconfigured connection surfaces here. Say what's wrong rather than
  // handing back an opaque server error.
  let family: Awaited<ReturnType<typeof listFamily>> = [];
  let problem: string | null = null;
  if (unlocked) {
    try {
      family = await listFamily();
    } catch (error) {
      console.error("[pickem] database unreachable:", error);
      problem = describeDbError(error);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-5 py-12">
      <header className="text-center">
        <p className="text-sm font-semibold tracking-[0.2em] text-muted uppercase">Family</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight">Pick&apos;em</h1>
        <p className="mt-3 text-sm text-muted">
          {problem ? "Almost there." : unlocked ? "Who's picking?" : "Enter the family PIN to get in."}
        </p>
      </header>

      {problem ? (
        <SetupProblem detail={problem} />
      ) : unlocked ? (
        <MemberPicker family={family} />
      ) : (
        <FamilyPinForm />
      )}
    </main>
  );
}
