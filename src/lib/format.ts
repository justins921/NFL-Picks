/** Kickoff times are always shown in Central, since that's where the family is. */
export const TIME_ZONE = "America/Chicago";

const dayTime = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  weekday: "short",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const timeOnly = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

const dayOnly = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  weekday: "long",
  month: "short",
  day: "numeric",
});

/** e.g. "Wed 9/9, 7:20 PM CT" */
export function formatKickoff(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBD";
  return `${dayTime.format(d).replace(", ", " ")} CT`;
}

/** e.g. "7:20 PM CT" */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBD";
  return `${timeOnly.format(d)} CT`;
}

/** e.g. "Wednesday, Sep 9" — used to group the slate by day. */
export function formatDayHeading(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBD";
  return dayOnly.format(d);
}

/** Stable key for grouping games into Central-time calendar days. */
export function centralDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "tbd";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
