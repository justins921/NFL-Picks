import type { Injury, InjuryStatus } from "@/lib/types";

const BADGE: Record<InjuryStatus, string> = {
  Out: "bg-loss/20 text-loss border-loss/40",
  "Injured Reserve": "bg-loss/15 text-loss/90 border-loss/30",
  Doubtful: "bg-warn/20 text-warn border-warn/40",
  Questionable: "bg-yellow-400/15 text-yellow-300 border-yellow-400/30",
  Suspension: "bg-surface-2 text-muted border-line",
  "Day-To-Day": "bg-surface-2 text-muted border-line",
  Other: "bg-surface-2 text-muted border-line",
};

const SHORT: Partial<Record<InjuryStatus, string>> = {
  "Injured Reserve": "IR",
  Questionable: "QUES",
  Doubtful: "DOUB",
  "Day-To-Day": "DTD",
  Suspension: "SUSP",
};

function Row({ injury }: { injury: Injury }) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span
        className={`w-14 shrink-0 rounded border px-1 py-0.5 text-center text-[10px] font-black uppercase ${
          BADGE[injury.status]
        }`}
      >
        {SHORT[injury.status] ?? injury.status}
      </span>
      <span className="w-9 shrink-0 text-xs font-bold text-muted">{injury.position}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{injury.name}</span>
      {injury.detail ? (
        <span className="shrink-0 text-xs text-muted">{injury.detail}</span>
      ) : null}
    </li>
  );
}

/**
 * Shows the names a casual fan cares about up front and tucks the rest of the
 * report behind a toggle, rather than dumping the whole 53-man list.
 */
export function InjuryList({
  injuries,
  available,
}: {
  injuries: Injury[];
  available: boolean;
}) {
  if (!available) {
    return <p className="py-2 text-sm text-muted">Injury report unavailable.</p>;
  }
  if (injuries.length === 0) {
    return <p className="py-2 text-sm text-muted">No injuries reported.</p>;
  }

  const key = injuries.filter((i) => i.keyPosition);
  const rest = injuries.filter((i) => !i.keyPosition);

  return (
    <div>
      <ul className="divide-y divide-line/60">
        {(key.length > 0 ? key : rest).map((injury) => (
          <Row key={injury.athleteId} injury={injury} />
        ))}
      </ul>

      {key.length > 0 && rest.length > 0 ? (
        <details className="mt-1">
          <summary className="cursor-pointer py-2 text-xs font-semibold text-muted">
            {rest.length} more on the report
          </summary>
          <ul className="divide-y divide-line/60">
            {rest.map((injury) => (
              <Row key={injury.athleteId} injury={injury} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
