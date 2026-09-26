"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin, assertUser } from "@/lib/session";
import { fillLocationAddress, importCommunityMap, importOpenFoodFacts, importRootBeerBarrel, linkBarcode, lookupBarcode } from "@/lib/catalog-import";

export async function runOpenFoodFactsImport() {
  const user = await assertAdmin();
  try {
    const result = await importOpenFoodFacts(user.id);
    revalidatePath("/", "layout");
    return { result };
  } catch (e) {
    return { error: `Open Food Facts import failed: ${(e as Error).message}` };
  }
}

export async function runRootBeerBarrelImport() {
  const user = await assertAdmin();
  try {
    const result = await importRootBeerBarrel(user.id);
    revalidatePath("/", "layout");
    return { result };
  } catch (e) {
    return { error: `Root Beer Barrel import failed: ${(e as Error).message}` };
  }
}

export async function scanBarcode(code: string) {
  const user = await assertUser();
  const res = await lookupBarcode(String(code).slice(0, 32), user.id);
  if (res.status === "found" && res.source === "openfoodfacts") revalidatePath("/directory");
  return res;
}

export async function attachBarcode(code: string, rootBeerId: string) {
  const user = await assertUser();
  const id = z.uuid().parse(rootBeerId);
  return { linked: await linkBarcode(String(code).slice(0, 32), id, user.id) };
}

export async function runCommunityMapImport() {
  const user = await assertAdmin();
  try {
    const result = await importCommunityMap(user.id);
    revalidatePath("/", "layout");
    return { result };
  } catch (e) {
    return { error: `Community map import failed: ${(e as Error).message}` };
  }
}

export async function lookupAddress(locationId: string) {
  await assertUser();
  return fillLocationAddress(z.uuid().parse(locationId));
}

export async function runRetailerSync() {
  const user = await assertAdmin();
  const { db, schema } = await import("@/db");
  const { eq } = await import("drizzle-orm");
  const { syncRetailers } = await import("@/lib/catalog-import/retailers");
  const [sync] = await db.insert(schema.sourceSyncs).values({ source: "retailers", userId: user.id }).returning({ id: schema.sourceSyncs.id });
  try {
    const result = await syncRetailers(user.id);
    await db.update(schema.sourceSyncs).set({ status: "ok", finishedAt: new Date(), result }).where(eq(schema.sourceSyncs.id, sync.id));
    revalidatePath("/", "layout");
    return { result };
  } catch (e) {
    await db.update(schema.sourceSyncs).set({ status: "failed", finishedAt: new Date(), error: (e as Error).message }).where(eq(schema.sourceSyncs.id, sync.id));
    return { error: `Retailer sync failed: ${(e as Error).message}` };
  }
}
