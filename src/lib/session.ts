import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

// Local stand-in for Auth.js: a signed cookie holding the member's id.
// Handoff: replace getCurrentUser() with `const session = await auth()` from Auth.js,
// keeping the same function names so the rest of the app doesn't change.

const COOKIE = "tb_session";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set (see .env.local)");
  return s;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export async function setSession(userId: string) {
  (await cookies()).set(COOKIE, `${userId}.${sign(userId)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function getCurrentUser() {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [userId, sig] = raw.split(".");
  if (!userId || !sig) return null;
  const expected = Buffer.from(sign(userId));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  return user ?? null;
}

/** For pages: redirects to /login when signed out. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For server actions and route handlers: throws when signed out. */
export async function assertUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

/** For admin-only server actions: throws unless the signed-in member is an admin. */
export async function assertAdmin() {
  const user = await assertUser();
  if (!user.isAdmin) throw new Error("Only admins can do that");
  return user;
}

// ---------- club access code ----------
// When CLUB_CODE is set (on Vercel), visitors must enter it before they can reach member sign-in.
const CLUB_COOKIE = "tb_club";

export function clubCodeRequired() {
  return !!process.env.CLUB_CODE;
}

export async function hasClubAccess() {
  if (!clubCodeRequired()) return true;
  const raw = (await cookies()).get(CLUB_COOKIE)?.value;
  if (!raw) return false;
  const expected = Buffer.from(sign(`club:${process.env.CLUB_CODE}`));
  const given = Buffer.from(raw);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function checkClubCode(code: string) {
  const want = Buffer.from((process.env.CLUB_CODE ?? "").trim().toLowerCase());
  const got = Buffer.from(code.trim().toLowerCase());
  const ok = want.length > 0 && want.length === got.length && timingSafeEqual(want, got);
  if (!ok) return false;
  (await cookies()).set(CLUB_COOKIE, sign(`club:${process.env.CLUB_CODE}`), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return true;
}
