import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";

const GATE_COOKIE = "family_gate";
const USER_COOKIE = "family_member";
const ONE_YEAR = 60 * 60 * 24 * 365;

function secret(): string {
  return process.env.SESSION_SECRET ?? "dev-only-insecure-secret";
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

/** Constant-time compare so a wrong PIN can't be guessed by timing. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function familyPin(): string {
  return process.env.FAMILY_PIN ?? "1234";
}

export function checkFamilyPin(input: string): boolean {
  return safeEqual(input.trim(), familyPin());
}

/* --- Site-wide gate --- */

export async function hasFamilyAccess(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(GATE_COOKIE)?.value;
  if (!token) return false;
  // The cookie is a signature over the current PIN, so changing FAMILY_PIN
  // invalidates every existing session.
  return safeEqual(token, sign(`gate:${familyPin()}`));
}

export async function grantFamilyAccess(): Promise<void> {
  const jar = await cookies();
  jar.set(GATE_COOKIE, sign(`gate:${familyPin()}`), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

/* --- Which family member is picking --- */

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const raw = jar.get(USER_COOKIE)?.value;
  if (!raw) return null;

  const [idPart, sig] = raw.split(".");
  if (!idPart || !sig || !safeEqual(sig, sign(`user:${idPart}`))) return null;

  const id = Number(idPart);
  if (!Number.isInteger(id)) return null;

  return db.select().from(users).where(and(eq(users.id, id), eq(users.active, true))).get() ?? null;
}

export async function setCurrentUser(userId: number): Promise<void> {
  const jar = await cookies();
  const value = `${userId}.${sign(`user:${userId}`)}`;
  jar.set(USER_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

export async function clearCurrentUser(): Promise<void> {
  const jar = await cookies();
  jar.delete(USER_COOKIE);
}

export async function signOutCompletely(): Promise<void> {
  const jar = await cookies();
  jar.delete(USER_COOKIE);
  jar.delete(GATE_COOKIE);
}

export function listFamily(): User[] {
  return db.select().from(users).where(eq(users.active, true)).all().sort((a, b) => a.name.localeCompare(b.name));
}

export async function requireUser(): Promise<User | null> {
  if (!(await hasFamilyAccess())) return null;
  return getCurrentUser();
}
