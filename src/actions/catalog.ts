"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertUser } from "@/lib/session";
import { searchCatalog } from "@/lib/queries";
import { searchKey } from "@/lib/normalize";
import { insertRootBeer, rootBeerInput } from "@/lib/catalog";
import { linkBarcode } from "@/lib/catalog-import";

export async function searchRootBeers(q: string) {
  await assertUser();
  return searchCatalog(q, 8);
}

export async function createRootBeer(input: z.input<typeof rootBeerInput> & { barcode?: string | null }) {
  const user = await assertUser();
  const { barcode, ...fields } = input;
  const parsed = rootBeerInput.safeParse(fields);
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const rb = await insertRootBeer(parsed.data, user.id);
  if (barcode) await linkBarcode(barcode, rb.id, user.id);
  revalidatePath("/directory");
  return { rootBeer: { id: rb.id, slug: rb.slug, brand: rb.brand, name: rb.name } } as const;
}

export async function updateRootBeer(id: string, _: unknown, formData: FormData) {
  const user = await assertUser();
  if (!user.isAdmin) return { error: "Only admins can edit catalog details." };
  const parsed = rootBeerInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db
    .update(schema.rootBeers)
    .set({
      ...parsed.data,
      discontinued: formData.get("discontinued") === "on",
      searchKey: searchKey(parsed.data.brand, parsed.data.name),
    })
    .where(eq(schema.rootBeers.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Merge `fromId` into `intoId`: re-point everything, keeping the newer rating when both exist. */
export async function mergeRootBeers(fromId: string, intoId: string) {
  const user = await assertUser();
  if (!user.isAdmin) return { error: "Only admins can merge catalog entries." };
  if (fromId === intoId) return { error: "Pick two different root beers" };
  await db.transaction(async (tx) => {
    // tastings: resolve (user, root beer) conflicts by keeping the most recently updated entry
    await tx.execute(sql`
      DELETE FROM tastings a USING tastings b
      WHERE a.root_beer_id IN (${fromId}, ${intoId}) AND b.root_beer_id IN (${fromId}, ${intoId})
        AND a.user_id = b.user_id AND a.id <> b.id AND a.updated_at < b.updated_at
    `);
    await tx.execute(sql`UPDATE tastings SET root_beer_id = ${intoId} WHERE root_beer_id = ${fromId}`);
    await tx.execute(sql`
      INSERT INTO favorites (user_id, root_beer_id) SELECT user_id, ${intoId} FROM favorites WHERE root_beer_id = ${fromId}
      ON CONFLICT DO NOTHING`);
    await tx.execute(sql`
      INSERT INTO location_root_beers (location_id, root_beer_id, price_cents, last_seen_on, reported_by)
      SELECT location_id, ${intoId}, price_cents, last_seen_on, reported_by FROM location_root_beers WHERE root_beer_id = ${fromId}
      ON CONFLICT (location_id, root_beer_id) DO UPDATE SET last_seen_on = greatest(location_root_beers.last_seen_on, excluded.last_seen_on)`);
    await tx.execute(sql`UPDATE purchase_links SET root_beer_id = ${intoId} WHERE root_beer_id = ${fromId}`);
    await tx.delete(schema.rootBeers).where(eq(schema.rootBeers.id, fromId));
  });
  revalidatePath("/", "layout");
  const [into] = await db.select({ slug: schema.rootBeers.slug }).from(schema.rootBeers).where(eq(schema.rootBeers.id, intoId));
  return { ok: true, slug: into?.slug };
}

/** Admin only: remove a wrong photo. The entry is locked so syncs won't add a photo again. */
export async function removeRootBeerPhoto(id: string) {
  const user = await assertUser();
  if (!user.isAdmin) return { error: "Only admins can change catalog photos." };
  await db
    .update(schema.rootBeers)
    .set({ imageUrl: null, imageSource: null, imageProductTitle: null, imageSourceUrl: null, imageLocked: true })
    .where(eq(schema.rootBeers.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Admin only: let syncs add a photo again after one was removed. */
export async function unlockRootBeerPhoto(id: string) {
  const user = await assertUser();
  if (!user.isAdmin) return { error: "Only admins can change catalog photos." };
  await db.update(schema.rootBeers).set({ imageLocked: false }).where(eq(schema.rootBeers.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}
