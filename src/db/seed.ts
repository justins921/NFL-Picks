/**
 * Seeds a demo family so the UI is usable the moment you start the app.
 * Safe to re-run: existing names are left alone.
 */
import { db } from "./index";
import { users } from "./schema";

const FAMILY = [
  { name: "Justin", isAdmin: true },
  { name: "Mom", isAdmin: false },
  { name: "Dad", isAdmin: false },
  { name: "Sarah", isAdmin: false },
  { name: "Ben", isAdmin: false },
  { name: "Grandpa", isAdmin: false },
];

for (const member of FAMILY) {
  db.insert(users).values(member).onConflictDoNothing().run();
}

const all = db.select().from(users).all();
console.log(`Seeded. ${all.length} family members:`);
for (const u of all) console.log(`  - ${u.name}${u.isAdmin ? " (admin)" : ""}`);
