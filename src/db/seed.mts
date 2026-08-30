/**
 * Seeds a demo family so the UI is usable the moment you start the app.
 * Safe to re-run: existing names are left alone.
 */
import { db } from "./index";
import { migrate } from "./migrate";
import { users } from "./schema";

const FAMILY = [
  { name: "Justin", isAdmin: true },
  { name: "Mom", isAdmin: false },
  { name: "Dad", isAdmin: false },
  { name: "Sarah", isAdmin: false },
  { name: "Ben", isAdmin: false },
  { name: "Grandpa", isAdmin: false },
];

await migrate();

for (const member of FAMILY) {
  await db.insert(users).values(member).onConflictDoNothing();
}

const all = await db.select().from(users);
console.log(`Seeded. ${all.length} family members:`);
for (const u of all) console.log(`  - ${u.name}${u.isAdmin ? " (admin)" : ""}`);
