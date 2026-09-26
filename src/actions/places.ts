"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertUser } from "@/lib/session";
import { today } from "@/lib/format";
import { resolvePlace, searchPlaces } from "@/lib/places";

// ---------- purchase links (R5) ----------

const linkInput = z.object({
  rootBeerId: z.uuid(),
  retailer: z.string().trim().min(1, "Retailer is required").max(80),
  url: z
    .url("Enter a full link starting with https://")
    .refine((u) => /^https?:\/\//i.test(u), "Link must start with http:// or https://"),
  price: z.coerce.number().positive("Price must be more than 0").max(10000),
  packSize: z.coerce.number().int().min(1).max(500).default(1),
  shippingNote: z.string().trim().max(200).optional().transform((v) => v || null),
});

export async function addPurchaseLink(_: unknown, formData: FormData) {
  const user = await assertUser();
  const parsed = linkInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { price, ...rest } = parsed.data;
  await db.insert(schema.purchaseLinks).values({
    ...rest,
    priceCents: Math.round(price * 100),
    lastCheckedOn: today(),
    addedBy: user.id,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deletePurchaseLink(id: string) {
  const user = await assertUser();
  const [link] = await db.select({ source: schema.purchaseLinks.source }).from(schema.purchaseLinks).where(eq(schema.purchaseLinks.id, id));
  if (link?.source === "retailer" && !user.isAdmin) return { error: "Only admins can remove links found by the retailer sync." };
  await db.delete(schema.purchaseLinks).where(eq(schema.purchaseLinks.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function confirmPurchaseLink(id: string) {
  await assertUser();
  await db.update(schema.purchaseLinks).set({ lastCheckedOn: today() }).where(eq(schema.purchaseLinks.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------- locations (R4) ----------

const locationInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  address: z.string().trim().max(300).optional().transform((v) => v || null),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  notes: z.string().trim().max(1000).optional().transform((v) => v || null),
});

export async function createLocation(input: z.input<typeof locationInput>) {
  const user = await assertUser();
  const parsed = locationInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const [loc] = await db
    .insert(schema.locations)
    .values({ ...parsed.data, source: "member", createdBy: user.id })
    .returning();
  revalidatePath("/map");
  return { location: loc } as const;
}

export async function updateLocation(id: string, input: { name: string; address?: string; notes?: string }) {
  await assertUser();
  const parsed = locationInput.pick({ name: true, address: true, notes: true }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.update(schema.locations).set(parsed.data).where(eq(schema.locations.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Admin only: removes a place (and its stock reports) from the map for everyone. */
export async function deleteLocation(id: string) {
  const user = await assertUser();
  if (!user.isAdmin) return { error: "Only admins can delete places from the map." };
  const [loc] = await db.select().from(schema.locations).where(eq(schema.locations.id, id));
  if (!loc) return { ok: true };
  // Pins that came from an outside map are remembered, so the next sync doesn't bring them back.
  if (loc.externalId?.startsWith("rbmap:")) {
    await db.insert(schema.locationTombstones).values({ externalId: loc.externalId, name: loc.name, deletedBy: user.id }).onConflictDoNothing();
  }
  await db.delete(schema.locations).where(eq(schema.locations.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** "I saw this here": adds or refreshes a root beer at a location (an existing pin, or a searched place). */
export async function reportSighting(input: {
  locationId?: string;
  place?: z.input<typeof placeHit>;
  rootBeerId: string;
  price?: string | number | null;
  seenOn?: string | null;
}) {
  const user = await assertUser();
  const price = input.price === "" || input.price == null ? null : Number(input.price);
  if (price != null && (!Number.isFinite(price) || price < 0)) return { error: "Price must be a number" };
  const seenOn = input.seenOn && /^\d{4}-\d{2}-\d{2}$/.test(input.seenOn) ? input.seenOn : today();
  if (seenOn > today()) return { error: "That date is in the future" };
  let locationId = input.locationId;
  if (!locationId && input.place) {
    const parsed = placeHit.safeParse(input.place);
    if (!parsed.success) return { error: "Pick a place from the list" };
    locationId = await resolvePlace(parsed.data, user.id);
  }
  if (!locationId) return { error: "Pick a place first" };
  const priceCents = price == null ? null : Math.round(price * 100);
  await db
    .insert(schema.locationRootBeers)
    .values({ locationId, rootBeerId: input.rootBeerId, priceCents, lastSeenOn: seenOn, reportedBy: user.id })
    .onConflictDoUpdate({
      target: [schema.locationRootBeers.locationId, schema.locationRootBeers.rootBeerId],
      set: {
        lastSeenOn: sql`greatest(${schema.locationRootBeers.lastSeenOn}, excluded.last_seen_on)`,
        reportedBy: user.id,
        ...(priceCents != null ? { priceCents } : {}),
      },
    });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeSighting(locationId: string, rootBeerId: string) {
  await assertUser();
  await db
    .delete(schema.locationRootBeers)
    .where(and(eq(schema.locationRootBeers.locationId, locationId), eq(schema.locationRootBeers.rootBeerId, rootBeerId)));
  revalidatePath("/", "layout");
  return { ok: true };
}

const placeHit = z.object({
  externalId: z.string().min(3).max(120),
  name: z.string().trim().min(1).max(160),
  address: z.string().max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  category: z.string().max(60).nullable(),
});
const nearInput = z.object({ lat: z.number(), lng: z.number() }).nullable();

/** Type-ahead search: club places first, then real-world places from the provider. */
export async function findPlaces(q: string, near: { lat: number; lng: number } | null = null) {
  await assertUser();
  if (q.trim().length < 2) return { club: [], external: [] };
  return searchPlaces(q.slice(0, 120), nearInput.parse(near));
}

/** Add a searched place to the club map (or return the existing pin for it). */
export async function addPlace(input: z.input<typeof placeHit>) {
  const user = await assertUser();
  const parsed = placeHit.safeParse(input);
  if (!parsed.success) return { error: "That place couldn't be added" } as const;
  const id = await resolvePlace(parsed.data, user.id);
  revalidatePath("/map");
  return { id } as const;
}
