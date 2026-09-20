"use client";

import { useActionState } from "react";
import { backfillPicks } from "@/app/actions";

/**
 * Closes pick gaps left by someone joining partway through the season. Useful
 * enough to keep around: it's the same button whenever a new family member is
 * added, and it's safe to press at any time.
 */
export function BackfillButton() {
  const [result, action, pending] = useActionState(backfillPicks, null);

  return (
    <form action={action} className="flex flex-col gap-2">
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl border border-line font-semibold active:bg-surface-2 disabled:opacity-50"
      >
        {pending ? "Filling…" : "Fill missing picks for earlier weeks"}
      </button>
      {result ? <p className="text-sm text-muted">{result}</p> : null}
    </form>
  );
}
