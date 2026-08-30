import type { Client } from "@libsql/client";
import { STATEMENTS } from "./migrate";

/**
 * The starting family, created only when the users table is completely empty.
 *
 * Because removing someone is a soft delete, their row survives, so this never
 * resurrects a person you took out — it only runs on a genuinely fresh
 * database.
 */
const STARTER_FAMILY: [name: string, isAdmin: 0 | 1][] = [
  ["Justin", 1],
  ["Mom", 0],
  ["Dad", 0],
  ["Sarah", 0],
  ["Ben", 0],
  ["Grandpa", 0],
];

/**
 * Makes a database usable on first contact, so deploying somewhere new needs no
 * setup step: point the app at an empty database and it creates its own tables.
 *
 * Runs at most once per process, and every statement is written so that two
 * cold starts racing each other is harmless — CREATE TABLE IF NOT EXISTS, and
 * INSERT OR IGNORE against a unique index on the name.
 */
export function createBootstrapper(raw: Client): () => Promise<void> {
  let started: Promise<void> | null = null;

  async function run(): Promise<void> {
    await raw.batch(
      STATEMENTS.map((sql) => ({ sql, args: [] })),
      "write",
    );

    const existing = await raw.execute("SELECT COUNT(*) AS n FROM users");
    if (Number(existing.rows[0]?.n ?? 0) > 0) return;

    await raw.batch(
      STARTER_FAMILY.map(([name, isAdmin]) => ({
        sql: "INSERT OR IGNORE INTO users (name, is_admin) VALUES (?, ?)",
        args: [name, isAdmin] as (string | number)[],
      })),
      "write",
    );
  }

  return () => {
    // Retry on the next call if it failed, rather than caching a broken state.
    started ??= run().catch((error) => {
      started = null;
      throw error;
    });
    return started;
  };
}

/**
 * Wraps the driver so the schema check happens before the first query, whatever
 * that query turns out to be. Doing it here rather than at each call site means
 * a query added later can't accidentally skip it.
 */
export function withBootstrap(raw: Client): Client {
  const ensure = createBootstrapper(raw);

  return new Proxy(raw, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      if (prop !== "execute" && prop !== "batch" && prop !== "migrate" && prop !== "transaction") {
        return value.bind(target);
      }
      return async (...args: unknown[]) => {
        await ensure();
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}
