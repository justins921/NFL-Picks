/**
 * Sets up the database. Safe to re-run.
 *
 * Run once per environment:
 *   npm run db:migrate                                    # local file
 *   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npm run db:migrate
 */
import { migrate } from "@/db/migrate";

await migrate();
console.log(`Database ready (${process.env.DATABASE_URL ?? "file:./data/picks.db"}).`);
