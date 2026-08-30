import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { withBootstrap } from "./bootstrap";
import { clean } from "./credentials";
import * as schema from "./schema";

/**
 * One driver covers both setups:
 *   local dev  DATABASE_URL=file:./data/picks.db
 *   Vercel     DATABASE_URL=libsql://<db>.turso.io  + DATABASE_AUTH_TOKEN
 *
 * Vercel's filesystem is ephemeral, so a file-backed database there would be
 * wiped on every deploy. Hosted libSQL keeps the same SQLite dialect, which is
 * why the schema and every query in this app are unchanged between the two.
 */
const url = clean(process.env.DATABASE_URL) || "file:./data/picks.db";
const authToken = clean(process.env.DATABASE_AUTH_TOKEN) || undefined;


if (url.startsWith("file:")) {
  try {
    mkdirSync(dirname(url.slice("file:".length)), { recursive: true });
  } catch (cause) {
    // A file-backed database is fine on a host with a real disk, but not on a
    // read-only one like Vercel — where this failing means DATABASE_URL was
    // never set. EROFS on its own doesn't explain that, so spell it out.
    throw new Error(
      `Could not create the folder for ${url}. If this is a hosted deployment, ` +
        "set DATABASE_URL to a libsql:// URL and DATABASE_AUTH_TOKEN — its " +
        "filesystem is read-only, so a file-backed database can't work there.",
      { cause },
    );
  }
}

// Next reloads modules on every edit in dev; reuse one client so we don't leak
// connections on each hot reload.
const globalForDb = globalThis as unknown as { __picksClient?: Client };
// withBootstrap creates the tables on first use, so pointing this at an empty
// database is all the setup a new deployment needs.
const client = globalForDb.__picksClient ?? withBootstrap(createClient({ url, authToken }));
globalForDb.__picksClient = client;

export const db = drizzle(client, { schema });
export { client, schema };

/**
 * Driver errors nest the useful part — an auth failure or a bad host — inside
 * `cause`, under a generic "Failed query" wrapper. Flatten the chain so the
 * actual reason is visible.
 */
export function describeDbError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error && parts.length < 4) {
    const code = (current as Error & { code?: string }).code;
    parts.push(code ? `${code}: ${current.message}` : current.message);
    current = current.cause;
  }
  return parts.join("\n\n") || String(error);
}
