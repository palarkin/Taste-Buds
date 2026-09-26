"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertAdmin, assertUser, checkClubCode, clearSession, hasClubAccess, setSession } from "@/lib/session";

const COLORS = ["#8b4513", "#b45309", "#0f766e", "#7c3aed", "#be123c", "#1d4ed8", "#4d7c0f", "#a21caf"];

export async function enterClubCode(_: unknown, formData: FormData) {
  const ok = await checkClubCode(String(formData.get("code") ?? ""));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 1200)); // slow down guessing
    return { error: "That code isn't right." };
  }
  redirect("/login");
}

export async function signInAs(userId: string) {
  if (!(await hasClubAccess())) throw new Error("Enter the club code first");
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) throw new Error("Unknown member");
  await setSession(user.id);
  redirect("/log");
}

export async function signOut() {
  await clearSession();
  redirect("/login");
}

const memberSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  email: z.union([z.literal(""), z.email()]).optional(),
});

async function nextColor() {
  const count = (await db.select({ id: schema.users.id }).from(schema.users)).length;
  return COLORS[count % COLORS.length];
}

/** First-run: create a member and sign in as them. Only allowed while the club has fewer than 5 members. */
export async function createMemberAndSignIn(_: unknown, formData: FormData) {
  if (!(await hasClubAccess())) return { error: "Enter the club code first" };
  // Only for setting up the very first member; everyone else is added by a member in Settings.
  if ((await db.select({ id: schema.users.id }).from(schema.users).limit(1)).length > 0) return { error: "This club is already set up. Ask a member to add you." };
  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const isFirst = (await db.select({ id: schema.users.id }).from(schema.users).limit(1)).length === 0;
  const [user] = await db
    .insert(schema.users)
    .values({ name: parsed.data.name, email: parsed.data.email || null, color: await nextColor(), isAdmin: isFirst })
    .returning();
  await setSession(user.id);
  redirect("/log");
}

export async function addMember(_: unknown, formData: FormData) {
  await assertUser();
  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.insert(schema.users).values({ name: parsed.data.name, email: parsed.data.email || null, color: await nextColor() });
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateMember(userId: string, _: unknown, formData: FormData) {
  await assertUser();
  const parsed = memberSchema.extend({ color: z.string().regex(/^#[0-9a-f]{6}$/i) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db
    .update(schema.users)
    .set({ name: parsed.data.name, email: parsed.data.email || null, color: parsed.data.color })
    .where(eq(schema.users.id, userId));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Admin only: grant or remove admin. The club always keeps at least one admin. */
export async function setAdmin(userId: string, isAdmin: boolean) {
  await assertAdmin();
  if (!isAdmin) {
    const admins = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.isAdmin, true));
    if (admins.length <= 1 && admins[0]?.id === userId) return { error: "The club needs at least one admin." };
  }
  await db.update(schema.users).set({ isAdmin }).where(eq(schema.users.id, userId));
  revalidatePath("/settings");
  return { ok: true };
}

/** Show or hide my name (and notes/photos) next to my ratings. Ratings always count toward averages. */
export async function setShareRatings(share: boolean) {
  const user = await assertUser();
  await db.update(schema.users).set({ shareRatings: share }).where(eq(schema.users.id, user.id));
  revalidatePath("/", "layout");
  return { ok: true };
}
