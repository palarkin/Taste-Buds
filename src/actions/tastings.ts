"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertUser } from "@/lib/session";
import { deleteFile } from "@/lib/storage";
import { resolvePlace } from "@/lib/places";

const tastingInput = z.object({
  rootBeerId: z.uuid(),
  rating: z.coerce.number().min(0).max(10).multipleOf(0.5),
  notes: z.string().trim().max(5000).optional().transform((v) => v || null),
  tastedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  purchasedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  price: z.union([z.literal(""), z.coerce.number().min(0).max(1000)]).optional().transform((v) => (v === "" || v == null ? null : Math.round(v * 100))),
  // Where they got it: an existing club location, or a place picked from search (created on save).
  place: z
    .union([
      z.object({ locationId: z.uuid() }),
      z.object({
        externalId: z.string().min(3).max(120),
        name: z.string().trim().min(1).max(160),
        address: z.string().max(300),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        category: z.string().max(60).nullable(),
      }),
    ])
    .nullable()
    .optional(),
  purchasedFrom: z.string().trim().max(200).optional().transform((v) => v || null),
});

/** Create or update the signed-in member's entry for a root beer. */
export async function saveTasting(input: z.input<typeof tastingInput>) {
  const user = await assertUser();
  const parsed = tastingInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const data = parsed.data;

  const { place, price, ...fields } = data;
  const locationId = !place ? null : "locationId" in place ? place.locationId : await resolvePlace(place, user.id);

  const values = { ...fields, locationId, priceCents: price, purchasedFrom: locationId ? null : fields.purchasedFrom };
  const [row] = await db
    .insert(schema.tastings)
    .values({ ...values, userId: user.id, source: "manual" })
    .onConflictDoUpdate({
      target: [schema.tastings.userId, schema.tastings.rootBeerId],
      set: { ...values, updatedAt: new Date() },
    })
    .returning({ id: schema.tastings.id });

  // Getting it somewhere is a report that the place carries it. The pickup date (not the tasting date)
  // is what tells others how current that is; keep the most recent date and latest known price.
  if (locationId) {
    await db
      .insert(schema.locationRootBeers)
      .values({ locationId, rootBeerId: data.rootBeerId, lastSeenOn: data.purchasedOn, priceCents: price, reportedBy: user.id })
      .onConflictDoUpdate({
        target: [schema.locationRootBeers.locationId, schema.locationRootBeers.rootBeerId],
        set: {
          lastSeenOn: sql`greatest(${schema.locationRootBeers.lastSeenOn}, excluded.last_seen_on)`,
          priceCents: sql`coalesce(excluded.price_cents, ${schema.locationRootBeers.priceCents})`,
          reportedBy: user.id,
        },
      });
  }

  revalidatePath("/", "layout");
  return { id: row.id } as const;
}

async function ownTasting(tastingId: string, userId: string) {
  const [t] = await db
    .select()
    .from(schema.tastings)
    .where(and(eq(schema.tastings.id, tastingId), eq(schema.tastings.userId, userId)));
  if (!t) throw new Error("That entry isn't yours");
  return t;
}

export async function deleteTasting(tastingId: string) {
  const user = await assertUser();
  await ownTasting(tastingId, user.id);
  const files = await db.select({ url: schema.media.url }).from(schema.media).where(eq(schema.media.tastingId, tastingId));
  await db.delete(schema.tastings).where(eq(schema.tastings.id, tastingId));
  await Promise.all(files.map((f) => deleteFile(f.url)));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteMedia(mediaId: string) {
  const user = await assertUser();
  const [m] = await db.select().from(schema.media).where(eq(schema.media.id, mediaId));
  if (!m) return { ok: true };
  await ownTasting(m.tastingId, user.id);
  await db.delete(schema.media).where(eq(schema.media.id, mediaId));
  await deleteFile(m.url);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function moveMediaFirst(mediaId: string) {
  const user = await assertUser();
  const [m] = await db.select().from(schema.media).where(eq(schema.media.id, mediaId));
  if (!m) return { ok: true };
  await ownTasting(m.tastingId, user.id);
  const all = await db.select().from(schema.media).where(eq(schema.media.tastingId, m.tastingId));
  const ordered = [m, ...all.filter((x) => x.id !== m.id).sort((a, b) => a.sortOrder - b.sortOrder)];
  await Promise.all(ordered.map((x, i) => db.update(schema.media).set({ sortOrder: i }).where(eq(schema.media.id, x.id))));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function toggleFavorite(rootBeerId: string) {
  const user = await assertUser();
  const where = and(eq(schema.favorites.userId, user.id), eq(schema.favorites.rootBeerId, rootBeerId));
  const [existing] = await db.select().from(schema.favorites).where(where);
  if (existing) await db.delete(schema.favorites).where(where);
  else await db.insert(schema.favorites).values({ userId: user.id, rootBeerId });
  revalidatePath("/", "layout");
  return { favorite: !existing };
}

/** After a browser upload to Vercel Blob finishes, record it on the entry (owner only, our blob store only). */
export async function recordUploadedMedia(input: { tastingId: string; url: string; contentType: string; size: number; takenAt?: string | null }) {
  const user = await assertUser();
  await ownTasting(input.tastingId, user.id);
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return { error: "Bad upload" };
  }
  if (!url.hostname.endsWith(".public.blob.vercel-storage.com") || !url.pathname.startsWith(`/tastings/${input.tastingId}/`)) {
    return { error: "Bad upload" };
  }
  const kind = input.contentType.startsWith("video/") ? "video" : "image";
  const existing = await db.select({ n: schema.media.sortOrder }).from(schema.media).where(eq(schema.media.tastingId, input.tastingId));
  const takenAt = input.takenAt ? new Date(input.takenAt) : null;
  await db.insert(schema.media).values({
    tastingId: input.tastingId,
    url: input.url,
    kind,
    mime: input.contentType,
    bytes: Math.max(0, Math.round(input.size)),
    takenAt: takenAt && !Number.isNaN(takenAt.getTime()) ? takenAt : null,
    sortOrder: existing.length ? Math.max(...existing.map((m) => m.n)) + 1 : 0,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
