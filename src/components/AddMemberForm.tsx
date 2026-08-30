"use client";

import { useActionState, useRef, useEffect } from "react";
import { addMember } from "@/app/actions";

export function AddMemberForm() {
  const [error, action, pending] = useActionState(addMember, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !error) formRef.current?.reset();
  }, [pending, error]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <input
        name="name"
        placeholder="Name"
        required
        maxLength={40}
        className="min-h-12 w-full rounded-xl border border-line bg-surface px-4 outline-none focus:border-chalk/40"
      />
      <input
        name="pin"
        inputMode="numeric"
        placeholder="Personal PIN (optional)"
        className="min-h-12 w-full rounded-xl border border-line bg-surface px-4 outline-none focus:border-chalk/40"
      />
      {error ? <p className="text-sm text-loss">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-chalk font-bold text-field disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add family member"}
      </button>
    </form>
  );
}
