"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  checkFamilyPin,
  clearCurrentUser,
  getCurrentUser,
  grantFamilyAccess,
  hasFamilyAccess,
  setCurrentUser,
  signOutCompletely,
} from "@/lib/auth";
import { getWeekSlate } from "@/lib/espn/season";
import { savePick } from "@/lib/picks";

export async function submitFamilyPin(_prev: string | null, formData: FormData): Promise<string | null> {
  const pin = String(formData.get("pin") ?? "");
  if (!checkFamilyPin(pin)) return "That PIN doesn't match. Try again.";
  await grantFamilyAccess();
  redirect("/login");
}

export async function chooseMember(_prev: string | null, formData: FormData): Promise<string | null> {
  if (!(await hasFamilyAccess())) return "Enter the family PIN first.";

  const userId = Number(formData.get("userId"));
  if (!Number.isInteger(userId)) return "Pick a name.";

  const found = await db.select().from(users).where(and(eq(users.id, userId), eq(users.active, true))).limit(1);
  const user = found[0];
  if (!user) return "That family member no longer exists.";

  // A personal PIN is optional. When one is set, it's required.
  if (user.pin) {
    const entered = String(formData.get("memberPin") ?? "").trim();
    if (entered !== user.pin) return `Wrong PIN for ${user.name}.`;
  }

  await setCurrentUser(userId);
  redirect("/");
}

export async function switchMember(): Promise<void> {
  await clearCurrentUser();
  redirect("/login");
}

export async function signOut(): Promise<void> {
  await signOutCompletely();
  redirect("/login");
}

export interface PickActionState {
  error: string | null;
}

/**
 * Records a pick. Re-reads the game from ESPN rather than trusting the client,
 * so a stale page can't sneak a pick in after kickoff.
 */
export async function makePick(_prev: PickActionState, formData: FormData): Promise<PickActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Pick your name first." };

  const gameId = String(formData.get("gameId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  const season = Number(formData.get("season"));
  const seasonType = Number(formData.get("seasonType"));
  const week = Number(formData.get("week"));

  if (!gameId || !teamId || !Number.isInteger(season) || !Number.isInteger(week)) {
    return { error: "Something went wrong with that pick." };
  }

  const slate = await getWeekSlate(season, seasonType, week);
  const game = slate.games.find((g) => g.id === gameId);
  if (!game) return { error: "Couldn't find that game." };

  const result = await savePick(user.id, game, teamId);
  if (!result.ok) {
    return {
      error: result.reason === "locked" ? "That game already kicked off." : "Couldn't save that pick.",
    };
  }

  revalidatePath("/");
  revalidatePath("/my-picks");
  revalidatePath("/standings");
  return { error: null };
}

/* --- Admin --- */

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return null;
  return user;
}

export async function addMember(_prev: string | null, formData: FormData): Promise<string | null> {
  if (!(await requireAdmin())) return "Only an admin can add family members.";

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return "Give them a name.";
  if (name.length > 40) return "That name is a bit long.";

  const [existing] = await db.select().from(users).where(eq(users.name, name)).limit(1);
  if (existing) {
    if (existing.active) return `${name} is already on the list.`;
    // Reactivate rather than duplicating, so their old picks come back too.
    await db.update(users).set({ active: true }).where(eq(users.id, existing.id));
    revalidatePath("/admin");
    return null;
  }

  const pin = String(formData.get("pin") ?? "").trim();
  await db.insert(users).values({ name, pin: pin || null, isAdmin: false });

  revalidatePath("/admin");
  revalidatePath("/login");
  return null;
}

export async function removeMember(formData: FormData): Promise<void> {
  if (!(await requireAdmin())) return;

  const userId = Number(formData.get("userId"));
  if (!Number.isInteger(userId)) return;

  // Soft delete: their picks stay in the table so past standings still add up.
  await db.update(users).set({ active: false }).where(eq(users.id, userId));

  revalidatePath("/admin");
  revalidatePath("/login");
  revalidatePath("/standings");
}

export async function toggleAdmin(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  if (!me) return;

  const userId = Number(formData.get("userId"));
  if (!Number.isInteger(userId)) return;

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return;

  // Don't let the last admin demote themselves out of the admin page.
  if (target.isAdmin) {
    const otherAdmins = await db
      .select()
      .from(users)
      .where(and(eq(users.isAdmin, true), eq(users.active, true), ne(users.id, userId)));
    if (otherAdmins.length === 0) return;
  }

  await db.update(users).set({ isAdmin: !target.isAdmin }).where(eq(users.id, userId));
  revalidatePath("/admin");
}
