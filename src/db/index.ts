import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

const path = resolve(process.env.DATABASE_PATH ?? "./data/picks.db");
mkdirSync(dirname(path), { recursive: true });

// Next dev reloads modules on every edit; reuse one connection so we don't
// leak file handles or re-run migrations on each hot reload.
const globalForDb = globalThis as unknown as { __picksDb?: Database.Database };
const sqlite = globalForDb.__picksDb ?? new Database(path);
globalForDb.__picksDb = sqlite;

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  pin TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (current_timestamp)
);
CREATE UNIQUE INDEX IF NOT EXISTS users_name_unique ON users(name);

CREATE TABLE IF NOT EXISTS picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  season_type INTEGER NOT NULL,
  week INTEGER NOT NULL,
  picked_team_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (current_timestamp),
  updated_at TEXT NOT NULL DEFAULT (current_timestamp)
);
CREATE UNIQUE INDEX IF NOT EXISTS picks_user_game_unique ON picks(user_id, game_id);
CREATE INDEX IF NOT EXISTS picks_week_idx ON picks(season, season_type, week);

CREATE TABLE IF NOT EXISTS games (
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
);
CREATE INDEX IF NOT EXISTS games_week_idx ON games(season, season_type, week);

CREATE TABLE IF NOT EXISTS game_snapshots (
  game_id TEXT PRIMARY KEY,
  captured_at TEXT NOT NULL DEFAULT (current_timestamp),
  win_probability TEXT,
  injuries TEXT
);
`);

export const db = drizzle(sqlite, { schema });
export { schema };
