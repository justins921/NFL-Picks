"use client";

import { useActionState } from "react";
import { submitFamilyPin } from "@/app/actions";

export function FamilyPinForm() {
  const [error, action, pending] = useActionState(submitFamilyPin, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="sr-only" htmlFor="pin">
        Family PIN
      </label>
      <input
        id="pin"
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        placeholder="••••"
        required
        className="w-full rounded-2xl border border-line bg-surface px-5 py-4 text-center text-2xl tracking-[0.5em] outline-none focus:border-chalk/40"
      />
      {error ? <p className="text-center text-sm text-loss">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="min-h-14 rounded-2xl bg-chalk px-5 text-lg font-bold text-field active:scale-[0.99] disabled:opacity-50"
      >
        {pending ? "Checking…" : "Let me in"}
      </button>
    </form>
  );
}
