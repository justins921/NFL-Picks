import type { Client } from "@libsql/client";

/**
 * The one place the schema is created.
 *
 * Both entry points call this — the app, which sets itself up on first use, and
 * the `db:migrate` script. They used to keep separate copies of the statement
 * list, which drifted: a column added to the script never reached a deployed
 * app, because nothing runs the script against a hosted database.
 */
export const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     pin TEXT,
     is_admin INTEGER NOT NULL DEFAULT 0,
     active INTEGER NOT NULL DEFAULT 1,
     created_at TEXT NOT NULL DEFAULT (current_timestamp)
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_name_unique ON users(name)`,

  `CREATE TABLE IF NOT EXISTS picks (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     game_id TEXT NOT NULL,
     season INTEGER NOT NULL,
     season_type INTEGER NOT NULL,
     week INTEGER NOT NULL,
     picked_team_id TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (current_timestamp),
     updated_at TEXT NOT NULL DEFAULT (current_timestamp)
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS picks_user_game_unique ON picks(user_id, game_id)`,
  `CREATE INDEX IF NOT EXISTS picks_week_idx ON picks(season, season_type, week)`,

  `CREATE TABLE IF NOT EXISTS games (
     id TEXT PRIMARY KEY,
     season INTEGER NOT NULL,
     season_type INTEGER NOT NULL,
     week INTEGER NOT NULL,
     kickoff TEXT NOT NULL,
     home_team_id TEXT NOT NULL,
     away_team_id TEXT NOT NULL,
     home_abbr TEXT NOT NULL,
     away_abbr TEXT NOT NULL,
     home_score INTEGER,
     away_score INTEGER,
     state TEXT NOT NULL,
     completed INTEGER NOT NULL DEFAULT 0,
     winner_team_id TEXT,
     updated_at TEXT NOT NULL DEFAULT (current_timestamp)
   )`,
  `CREATE INDEX IF NOT EXISTS games_week_idx ON games(season, season_type, week)`,

  `CREATE TABLE IF NOT EXISTS game_snapshots (
     game_id TEXT PRIMARY KEY,
     captured_at TEXT NOT NULL DEFAULT (current_timestamp),
     win_probability TEXT,
     injuries TEXT
   )`,
];

const ADDED_COLUMNS: { table: string; column: string; definition: string }[] = [
  { table: "picks", column: "auto", definition: "INTEGER NOT NULL DEFAULT 0" },
  { table: "games", column: "favorite_team_id", definition: "TEXT" },
];


export async function applySchema(client: Client): Promise<void> {
  for (const sql of STATEMENTS) await client.execute(sql);

  for (const { table, column, definition } of ADDED_COLUMNS) {
    const info = await client.execute(`PRAGMA table_info(${table})`);
    if (info.rows.some((row) => row.name === column)) continue;

    try {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      // SQLite has no "ADD COLUMN IF NOT EXISTS", so the check above is not
      // atomic: a deploy cold-starts several instances at once, they all see
      // the column as missing, and all but one lose the race. Losing it means
      // the column now exists, which is the outcome we wanted.
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (!message.includes("duplicate column")) throw error;
    }
  }
}
