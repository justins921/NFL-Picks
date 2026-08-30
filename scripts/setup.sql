-- Family Pick'em — one-time database setup.
--
-- Paste this whole file into Turso's SQL runner for your database (or run
-- `npm run db:setup` locally instead — they do exactly the same thing).
-- Safe to re-run: nothing here overwrites existing data.

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

-- Starting family. Change these names to your actual family before running,
-- or add and remove people later in the app's Family tab.
-- The 1 marks an admin; everyone else gets 0.
INSERT OR IGNORE INTO users (name, is_admin) VALUES
  ('Justin',  1),
  ('Mom',     0),
  ('Dad',     0),
  ('Sarah',   0),
  ('Ben',     0),
  ('Grandpa', 0);
