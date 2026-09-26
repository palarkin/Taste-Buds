"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ImportChange } from "@/db/schema";
import { assertUser } from "@/lib/session";
import { searchCatalog, type CatalogHit } from "@/lib/queries";
import { insertRootBeer } from "@/lib/catalog";
import { searchKey } from "@/lib/normalize";

export type MatchResult = {
  key: string;
  candidates: CatalogHit[];
  suggestion: { kind: "match"; id: string } | { kind: "suggest"; id: string } | { kind: "new" };
};

const AUTO = 0.8;
const SUGGEST = 0.4;

/** For each distinct label in the file, find catalog candidates and a suggested decision. */
export async function matchLabels(labels: { key: string; brand: string; name: string }[]): Promise<MatchResult[]> {
  await assertUser();
  const out: MatchResult[] = [];
  for (const l of labels.slice(0, 2000)) {
    const q = `${l.brand} ${l.name === "Root Beer" ? "" : l.name}`.trim();
    const candidates = await searchCatalog(q, 5);
    const exact = candidates.find((c) => searchKey(c.brand, c.name) === searchKey(l.brand, l.name));
    const top = exact ?? candidates[0];
    const score = exact ? 1 : (top?.score ?? 0);
    out.push({
      key: l.key,
      candidates,
      suggestion: score >= AUTO ? { kind: "match", id: top!.id } : score >= SUGGEST ? { kind: "suggest", id: top!.id } : { kind: "new" },
    });
  }
  return out;
}

/** The signed-in member's current ratings, keyed by root beer id (used to spot conflicts). */
export async function getMyRatings(): Promise<Record<string, number>> {
  const user = await assertUser();
  const rows = await db
    .select({ id: schema.tastings.rootBeerId, rating: schema.tastings.rating })
    .from(schema.tastings)
    .where(eq(schema.tastings.userId, user.id));
  return Object.fromEntries(rows.map((r) => [r.id, r.rating]));
}

const commitInput = z.object({
  filename: z.string().max(200),
  rows: z
    .array(
      z.object({
        target: z.union([
          z.object({ id: z.uuid() }),
          z.object({ newKey: z.string(), brand: z.string().trim().min(1).max(80), name: z.string().trim().max(80) }),
        ]),
        rating: z.number().min(0).max(10),
        notes: z.string().max(5000).nullable(),
        tastedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
        where: z.string().max(200).nullable(),
        onConflict: z.enum(["keep", "overwrite"]),
      }),
    )
    .max(5000),
});

export async function commitImport(input: z.input<typeof commitInput>) {
  const user = await assertUser();
  const parsed = commitInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const { filename, rows } = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(schema.importBatches)
      .values({ userId: user.id, filename, rowCount: rows.length })
      .returning();

    // Create each new catalog entry once, even if several rows reference it.
    const newIds = new Map<string, string>();
    for (const r of rows) {
      if ("newKey" in r.target && !newIds.has(r.target.newKey)) {
        const rb = await insertRootBeer(
          { brand: r.target.brand, name: r.target.name || "Root Beer", maker: null, style: null, sweetener: null, origin: null, description: null },
          user.id,
          tx,
        );
        newIds.set(r.target.newKey, rb.id);
      }
    }

    // If the file lists the same root beer twice, the later row wins.
    const byRootBeer = new Map<string, (typeof rows)[number]>();
    for (const r of rows) byRootBeer.set("id" in r.target ? r.target.id : newIds.get(r.target.newKey)!, r);

    const ids = [...byRootBeer.keys()];
    const existing = ids.length
      ? await tx
          .select()
          .from(schema.tastings)
          .where(and(eq(schema.tastings.userId, user.id), inArray(schema.tastings.rootBeerId, ids)))
      : [];
    const existingBy = new Map(existing.map((t) => [t.rootBeerId, t]));

    const changes: ImportChange[] = [];
    let created = 0, updated = 0, skipped = rows.length - byRootBeer.size;

    for (const [rootBeerId, r] of byRootBeer) {
      const prev = existingBy.get(rootBeerId);
      if (prev) {
        // Same rating = already in the log (matches what the review screen shows).
        if (r.onConflict === "keep" || prev.rating === r.rating) {
          skipped++;
          continue;
        }
        await tx
          .update(schema.tastings)
          .set({
            rating: r.rating,
            notes: r.notes ?? prev.notes,
            tastedOn: r.tastedOn ?? prev.tastedOn,
            purchasedFrom: r.where ?? prev.purchasedFrom,
            updatedAt: new Date(),
          })
          .where(eq(schema.tastings.id, prev.id));
        changes.push({ tastingId: prev.id, previous: { rating: prev.rating, notes: prev.notes, tastedOn: prev.tastedOn } });
        updated++;
      } else {
        const [t] = await tx
          .insert(schema.tastings)
          .values({
            userId: user.id,
            rootBeerId,
            rating: r.rating,
            notes: r.notes,
            tastedOn: r.tastedOn,
            purchasedFrom: r.where,
            source: "import",
            importBatchId: batch.id,
          })
          .returning({ id: schema.tastings.id });
        changes.push({ tastingId: t.id, previous: null });
        created++;
      }
    }

    await tx
      .update(schema.importBatches)
      .set({ createdCount: created, updatedCount: updated, skippedCount: skipped, changes })
      .where(eq(schema.importBatches.id, batch.id));

    return { batchId: batch.id, created, updated, skipped, newRootBeers: newIds.size };
  });

  revalidatePath("/", "layout");
  return result;
}

export async function undoImport(batchId: string) {
  const user = await assertUser();
  const [batch] = await db
    .select()
    .from(schema.importBatches)
    .where(and(eq(schema.importBatches.id, batchId), eq(schema.importBatches.userId, user.id)));
  if (!batch) return { error: "Import not found" };
  if (batch.status === "undone") return { error: "Already undone" };

  await db.transaction(async (tx) => {
    for (const c of batch.changes) {
      if (c.previous === null) {
        await tx.delete(schema.tastings).where(and(eq(schema.tastings.id, c.tastingId), eq(schema.tastings.userId, user.id)));
      } else {
        await tx
          .update(schema.tastings)
          .set({ rating: c.previous.rating, notes: c.previous.notes, tastedOn: c.previous.tastedOn, updatedAt: new Date() })
          .where(and(eq(schema.tastings.id, c.tastingId), eq(schema.tastings.userId, user.id)));
      }
    }
    await tx.update(schema.importBatches).set({ status: "undone" }).where(eq(schema.importBatches.id, batchId));
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
