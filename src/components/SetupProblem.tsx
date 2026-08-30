/**
 * Shown instead of a blank server error when the app can't reach its database.
 * Only rendered behind the family PIN, so the detail isn't public.
 */
export function SetupProblem({ detail }: { detail: string }) {
  return (
    <div className="rounded-2xl border border-loss/40 bg-loss/10 p-5 text-left">
      <h2 className="text-base font-bold">Can&apos;t reach the database</h2>
      <p className="mt-2 text-sm text-muted">
        Everything else is working — this is the connection to Turso. Check these
        two, then redeploy:
      </p>
      <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
        <li>
          <span className="text-chalk">DATABASE_AUTH_TOKEN</span> is a full
          read &amp; write token, pasted whole. It&apos;s long, and a truncated
          copy fails exactly like this. Use Turso&apos;s copy button rather than
          selecting the text — a manual selection can pick up invisible
          characters.
        </li>
        <li>
          <span className="text-chalk">DATABASE_URL</span> matches the URL on the
          database&apos;s Turso page, starting with <code>libsql://</code>.
        </li>
      </ul>
      <p className="mt-3 text-xs text-muted">
        Changing an environment variable in Vercel needs a redeploy to take
        effect.
      </p>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-field/60 p-3 text-xs text-muted">
        {detail}
      </pre>
    </div>
  );
}
