import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** A family member who makes picks. */
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    /** Optional personal PIN on top of the shared family PIN. Null = no personal PIN. */
    pin: text("pin"),
    isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
    /** Soft delete so historical picks and standings stay intact. */
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [uniqueIndex("users_name_unique").on(t.name)],
);

/**
 * One pick per user per game. `gameId` is the ESPN event id.
 * `pickedTeamId` is the ESPN team id of the team picked to win straight up.
 */
export const picks = sqliteTable(
  "picks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: text("game_id").notNull(),
    season: integer("season").notNull(),
    seasonType: integer("season_type").notNull(),
    week: integer("week").notNull(),
    pickedTeamId: text("picked_team_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [
    uniqueIndex("picks_user_game_unique").on(t.userId, t.gameId),
    index("picks_week_idx").on(t.season, t.seasonType, t.week),
  ],
);

/**
 * Our own cache of each game's outcome. This is what standings are graded
 * against, so a family member's record never depends on ESPN being reachable.
 */
export const games = sqliteTable(
  "games",
  {
    id: text("id").primaryKey(),
    season: integer("season").notNull(),
    seasonType: integer("season_type").notNull(),
    week: integer("week").notNull(),
    kickoff: text("kickoff").notNull(),
    homeTeamId: text("home_team_id").notNull(),
    awayTeamId: text("away_team_id").notNull(),
    homeAbbr: text("home_abbr").notNull(),
    awayAbbr: text("away_abbr").notNull(),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    state: text("state", { enum: ["pre", "in", "post"] }).notNull(),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
    /** ESPN team id of the winner, or "TIE" when the game ended level. */
    winnerTeamId: text("winner_team_id"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [index("games_week_idx").on(t.season, t.seasonType, t.week)],
);

/**
 * Frozen copy of the win probability and injury report as they looked when the
 * game kicked off, so later report changes don't rewrite history.
 */
export const gameSnapshots = sqliteTable("game_snapshots", {
  gameId: text("game_id").primaryKey(),
  capturedAt: text("captured_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  /** JSON: { home: number, away: number, source: string } */
  winProbability: text("win_probability"),
  /** JSON: NormalizedInjury[] keyed by team, see lib/types.ts */
  injuries: text("injuries"),
});

export type User = typeof users.$inferSelect;
export type Pick = typeof picks.$inferSelect;
export type GameRow = typeof games.$inferSelect;
