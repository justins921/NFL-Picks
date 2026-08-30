import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
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
const url = process.env.DATABASE_URL ?? "file:./data/picks.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (url.startsWith("file:")) {
  mkdirSync(dirname(url.slice("file:".length)), { recursive: true });
}

// Next reloads modules on every edit in dev; reuse one client so we don't leak
// connections on each hot reload.
const globalForDb = globalThis as unknown as { __picksClient?: Client };
const client = globalForDb.__picksClient ?? createClient({ url, authToken });
globalForDb.__picksClient = client;

export const db = drizzle(client, { schema });
export { client, schema };
