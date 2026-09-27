"use server";

import { revalidatePath } from "next/cache";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertAdmin } from "@/lib/session";
import { dismissPair, mergePlaceInto, mergeRootBeerInto, type DuplicateKind } from "@/lib/duplicates";

// Admin tools for the duplicate review page (Settings → Review duplicates).

const kind = z.enum(["place", "rootbeer"]);
const ids = z.object({ kind, keepId: z.uuid(), dropId: z.uuid() }).refine((v) => v.keepId !== v.dropId, "Pick two different entries");

export async function mergeDuplicate(input: { kind: DuplicateKind; keepId: string; dropId: string }) {
  const user = await assertAdmin();
  const parsed = ids.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { keepId, dropId } = parsed.data;
  try {
    if (parsed.data.kind === "rootbeer") await mergeRootBeerInto(dropId, keepId, user.id);
    else await mergePlaceInto(dropId, keepId, user.id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function dismissDuplicate(input: { kind: DuplicateKind; aId: string; bId: string }) {
  const user = await assertAdmin();
  const parsed = z.object({ kind, aId: z.uuid(), bId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "Invalid pair" };
  await dismissPair(parsed.data.kind, parsed.data.aId, parsed.data.bId, user.id);
  revalidatePath("/settings/duplicates");
  return { ok: true };
}

/** Admin only: delete a catalog entry nobody has rated (rated ones should be merged, so ratings aren't lost). */
export async function deleteRootBeer(id: string) {
  await assertAdmin();
  if (!z.uuid().safeParse(id).success) return { error: "Invalid root beer" };
  const [{ n }] = await db.select({ n: count() }).from(schema.tastings).where(eq(schema.tastings.rootBeerId, id));
  if (n > 0) return { error: `${n} rating${n === 1 ? "" : "s"} would be lost. Merge it into the other entry instead.` };
  await db.delete(schema.rootBeers).where(eq(schema.rootBeers.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}
