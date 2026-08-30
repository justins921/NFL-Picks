"use client";

import { useActionState, useState } from "react";
import type { User } from "@/db/schema";
import { chooseMember } from "@/app/actions";

export function MemberPicker({ family }: { family: User[] }) {
  const [error, action, pending] = useActionState(chooseMember, null);
  const [selected, setSelected] = useState<User | null>(null);

  if (family.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-surface p-5 text-center text-sm text-muted">
        No family members yet. Run <code className="text-chalk">npm run db:seed</code> to add some.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="userId" value={selected?.id ?? ""} />

      <div className="grid grid-cols-2 gap-3">
        {family.map((member) => {
          const isSelected = selected?.id === member.id;
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => setSelected(member)}
              aria-pressed={isSelected}
              className={`min-h-16 rounded-2xl border px-4 text-lg font-bold transition ${
                isSelected
                  ? "border-chalk bg-chalk text-field"
                  : "border-line bg-surface text-chalk active:bg-surface-2"
              }`}
            >
              {member.name}
            </button>
          );
        })}
      </div>

      {selected?.pin ? (
        <input
          name="memberPin"
          type="password"
          inputMode="numeric"
          placeholder={`${selected.name}'s PIN`}
          required
          className="w-full rounded-2xl border border-line bg-surface px-5 py-4 text-center text-xl tracking-[0.4em] outline-none focus:border-chalk/40"
        />
      ) : null}

      {error ? <p className="text-center text-sm text-loss">{error}</p> : null}

      <button
        type="submit"
        disabled={!selected || pending}
        className="min-h-14 rounded-2xl bg-win px-5 text-lg font-bold text-field active:scale-[0.99] disabled:opacity-40"
      >
        {pending ? "One sec…" : selected ? `Start picking as ${selected.name}` : "Pick your name"}
      </button>
    </form>
  );
}
