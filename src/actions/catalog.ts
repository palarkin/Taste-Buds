"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertUser } from "@/lib/session";
import { searchCatalog } from "@/lib/queries";
import { searchKey } from "@/lib/normalize";
import { insertRootBeer, rootBeerInput } from "@/lib/catalog";
import { linkBarcode } from "@/lib/catalog-import";
import { mergeRootBeerInto } from "@/lib/duplicates";

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

/** Merge `fromId` into `intoId`: re-point everything (see lib/duplicates for how ratings are combined). */
export async function mergeRootBeers(fromId: string, intoId: string) {
  const user = await assertUser();
  if (!user.isAdmin) return { error: "Only admins can merge catalog entries." };
  if (fromId === intoId) return { error: "Pick two different root beers" };
  try {
    const { slug } = await mergeRootBeerInto(fromId, intoId, user.id);
    revalidatePath("/", "layout");
    return { ok: true, slug };
  } catch (e) {
    return { error: (e as Error).message };
  }
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
