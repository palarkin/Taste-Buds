import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { variantSet } from "@/lib/catalog-import/retail-parse";

// Possible duplicates for admins to review, and the merges that resolve them.
// A merge moves everything onto the kept entry and leaves a pointer behind (an alias for root beers,
// a tombstone for places), so syncs and searches resolve to the kept entry instead of re-creating the other.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const rows = <T>(r: unknown) => (r as { rows: T[] }).rows;

export type DuplicateKind = "place" | "rootbeer";

export type PlaceSide = {
  id: string;
  name: string;
  address: string | null;
  category: string | null;
  notes: string | null;
  origin: string; // where the pin came from
  rootBeers: number;
  tastings: number;
  createdAt: string;
};

export type RootBeerSide = {
  id: string;
  slug: string;
  brand: string;
  name: string;
  imageUrl: string | null;
  style: string | null;
  source: string;
  tastings: number;
  places: number;
  links: number;
  barcodes: number;
  createdAt: string;
};

export type DuplicatePair<T> = { a: T; b: T; reason: string; score: number };

function placeOrigin(source: string, externalId: string | null) {
  if (externalId?.startsWith("rbmap:")) return "Community map";
  if (externalId?.startsWith("obdb:")) return "Brewery list";
  if (externalId?.startsWith("osm:")) return source === "member" ? "Added by a member (from search)" : "Place search";
  return source === "member" ? "Added by a member" : "Imported";
}

const LIMIT = 150;

/** Pins close together with similar names, or practically on top of each other. */
export async function placeDuplicates(): Promise<DuplicatePair<PlaceSide>[]> {
  const pairs = rows<{ a_id: string; b_id: string; meters: number; name_sim: number }>(
    await db.execute(sql`
      WITH p AS (
        SELECT a.id a_id, b.id b_id,
          similarity(lower(a.name), lower(b.name))::float name_sim,
          sqrt(power((a.lat - b.lat) * 111320, 2) + power((a.lng - b.lng) * 111320 * cos(radians(a.lat)), 2))::float meters
        FROM locations a
        JOIN locations b ON a.id < b.id AND abs(a.lat - b.lat) < 0.0045 AND abs(a.lng - b.lng) < 0.006
      )
      SELECT * FROM p
      WHERE (meters < 30 OR (meters < 250 AND name_sim > 0.3) OR (meters < 500 AND name_sim > 0.6))
        AND NOT EXISTS (SELECT 1 FROM duplicate_dismissals d WHERE d.kind = 'place' AND d.a_id = p.a_id AND d.b_id = p.b_id)
      ORDER BY name_sim DESC, meters
      LIMIT ${LIMIT}`),
  );
  if (!pairs.length) return [];
  const ids = [...new Set(pairs.flatMap((p) => [p.a_id, p.b_id]))];
  const sides = new Map(
    rows<{ id: string; name: string; address: string | null; category: string | null; notes: string | null; source: string; external_id: string | null; root_beers: number; tastings: number; created_at: string }>(
      await db.execute(sql`
        SELECT l.id, l.name, l.address, l.category, l.notes, l.source, l.external_id, l.created_at,
          (SELECT count(*)::int FROM location_root_beers x WHERE x.location_id = l.id) root_beers,
          (SELECT count(*)::int FROM tastings t WHERE t.location_id = l.id) tastings
        FROM locations l WHERE l.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`),
    ).map((l) => [
      l.id,
      {
        id: l.id,
        name: l.name,
        address: l.address,
        category: l.category,
        notes: l.notes,
        origin: placeOrigin(l.source, l.external_id),
        rootBeers: l.root_beers,
        tastings: l.tastings,
        createdAt: new Date(l.created_at).toISOString(),
      } satisfies PlaceSide,
    ]),
  );
  return pairs.map((p) => ({
    a: sides.get(p.a_id)!,
    b: sides.get(p.b_id)!,
    score: p.name_sim,
    reason: `${p.meters < 10 ? "Same spot" : `${Math.round(p.meters)} m apart`} · names ${Math.round(p.name_sim * 100)}% alike`,
  }));
}

/** Catalog entries with near-identical names. Different variants (Diet vs regular, Vanilla…) are never suggested. */
export async function rootBeerDuplicates(): Promise<DuplicatePair<RootBeerSide>[]> {
  const pairs = rows<{ a_id: string; b_id: string; score: number; a_label: string; b_label: string }>(
    await db.execute(sql`
      SELECT a.id a_id, b.id b_id, similarity(a.search_key, b.search_key)::float score,
        a.brand || ' ' || a.name a_label, b.brand || ' ' || b.name b_label
      FROM root_beers a
      JOIN root_beers b ON a.id < b.id AND a.search_key % b.search_key
      WHERE similarity(a.search_key, b.search_key) >= 0.5
        AND NOT EXISTS (SELECT 1 FROM duplicate_dismissals d WHERE d.kind = 'rootbeer' AND d.a_id = a.id AND d.b_id = b.id)
      ORDER BY score DESC
      LIMIT ${LIMIT * 3}`),
  )
    .filter((p) => variantSet(p.a_label).join() === variantSet(p.b_label).join())
    .slice(0, LIMIT);
  if (!pairs.length) return [];
  const ids = [...new Set(pairs.flatMap((p) => [p.a_id, p.b_id]))];
  const sides = new Map(
    rows<{ id: string; slug: string; brand: string; name: string; image_url: string | null; style: string | null; source: string; created_at: string; tastings: number; places: number; links: number; barcodes: number }>(
      await db.execute(sql`
        SELECT r.id, r.slug, r.brand, r.name, r.image_url, r.style, r.source, r.created_at,
          (SELECT count(*)::int FROM tastings t WHERE t.root_beer_id = r.id) tastings,
          (SELECT count(*)::int FROM location_root_beers x WHERE x.root_beer_id = r.id) places,
          (SELECT count(*)::int FROM purchase_links pl WHERE pl.root_beer_id = r.id) links,
          (SELECT count(*)::int FROM root_beer_barcodes bc WHERE bc.root_beer_id = r.id) barcodes
        FROM root_beers r WHERE r.id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`),
    ).map((r) => [
      r.id,
      {
        id: r.id,
        slug: r.slug,
        brand: r.brand,
        name: r.name,
        imageUrl: r.image_url,
        style: r.style,
        source: r.source,
        tastings: r.tastings,
        places: r.places,
        links: r.links,
        barcodes: r.barcodes,
        createdAt: new Date(r.created_at).toISOString(),
      } satisfies RootBeerSide,
    ]),
  );
  return pairs.map((p) => ({ a: sides.get(p.a_id)!, b: sides.get(p.b_id)!, score: p.score, reason: `Names ${Math.round(p.score * 100)}% alike` }));
}

export async function dismissPair(kind: DuplicateKind, x: string, y: string, userId: string) {
  const [aId, bId] = x < y ? [x, y] : [y, x];
  await db.insert(schema.duplicateDismissals).values({ kind, aId, bId, dismissedBy: userId }).onConflictDoNothing();
}

/**
 * Merge root beer `dropId` into `keepId`. Ratings move over; when a member rated both, their most recently
 * updated rating is kept, and the other one's photos and any details it alone had are folded into it.
 */
export async function mergeRootBeerInto(dropId: string, keepId: string, userId: string) {
  return db.transaction(async (tx) => {
    const [keep] = await tx.select().from(schema.rootBeers).where(eq(schema.rootBeers.id, keepId));
    const [drop] = await tx.select().from(schema.rootBeers).where(eq(schema.rootBeers.id, dropId));
    if (!keep || !drop) throw new Error("One of these root beers no longer exists. Refresh and try again.");

    // Members who rated both.
    const both = await tx
      .select()
      .from(schema.tastings)
      .where(inArray(schema.tastings.rootBeerId, [keepId, dropId]))
      .then((ts) => {
        const byUser = new Map<string, typeof ts>();
        for (const t of ts) byUser.set(t.userId, [...(byUser.get(t.userId) ?? []), t]);
        return [...byUser.values()].filter((list) => list.length === 2);
      });
    for (const pair of both) {
      const [winner, loser] = [...pair].sort((x, y) => y.updatedAt.getTime() - x.updatedAt.getTime() || Number(y.rootBeerId === keepId) - Number(x.rootBeerId === keepId));
      await tx.update(schema.media).set({ tastingId: winner.id }).where(eq(schema.media.tastingId, loser.id));
      // Delete first: the winner may move onto the loser's root beer (one rating per member per root beer).
      await tx.delete(schema.tastings).where(eq(schema.tastings.id, loser.id));
      await tx
        .update(schema.tastings)
        .set({
          notes: winner.notes ?? loser.notes,
          tastedOn: winner.tastedOn ?? loser.tastedOn,
          purchasedOn: winner.purchasedOn ?? loser.purchasedOn,
          priceCents: winner.priceCents ?? loser.priceCents,
          locationId: winner.locationId ?? loser.locationId,
          purchasedFrom: winner.purchasedFrom ?? loser.purchasedFrom,
          rootBeerId: keepId,
        })
        .where(eq(schema.tastings.id, winner.id));
    }
    await tx.update(schema.tastings).set({ rootBeerId: keepId }).where(eq(schema.tastings.rootBeerId, dropId));

    await tx.execute(sql`
      INSERT INTO favorites (user_id, root_beer_id, created_at) SELECT user_id, ${keepId}, created_at FROM favorites WHERE root_beer_id = ${dropId}
      ON CONFLICT DO NOTHING`);
    await tx.execute(sql`
      INSERT INTO location_root_beers (location_id, root_beer_id, price_cents, last_seen_on, reported_by)
      SELECT location_id, ${keepId}, price_cents, last_seen_on, reported_by FROM location_root_beers WHERE root_beer_id = ${dropId}
      ON CONFLICT (location_id, root_beer_id) DO UPDATE SET
        last_seen_on = greatest(location_root_beers.last_seen_on, excluded.last_seen_on),
        price_cents = coalesce(location_root_beers.price_cents, excluded.price_cents)`);
    await tx.update(schema.purchaseLinks).set({ rootBeerId: keepId }).where(eq(schema.purchaseLinks.rootBeerId, dropId));
    await tx.update(schema.rootBeerBarcodes).set({ rootBeerId: keepId }).where(eq(schema.rootBeerBarcodes.rootBeerId, dropId));

    // Details only the merged-away entry had.
    const fill: Partial<typeof schema.rootBeers.$inferInsert> = {};
    for (const k of ["maker", "style", "sweetener", "origin", "description", "sourceUrl"] as const) if (!keep[k] && drop[k]) fill[k] = drop[k];
    if (!keep.imageUrl && !keep.imageLocked && drop.imageUrl) {
      Object.assign(fill, { imageUrl: drop.imageUrl, imageSource: drop.imageSource, imageProductTitle: drop.imageProductTitle, imageSourceUrl: drop.imageSourceUrl });
    }
    if (Object.keys(fill).length) await tx.update(schema.rootBeers).set(fill).where(eq(schema.rootBeers.id, keepId));

    // Leave a pointer: syncs matching the old name, and old links, now land on the kept entry.
    await tx.update(schema.rootBeerAliases).set({ rootBeerId: keepId }).where(eq(schema.rootBeerAliases.rootBeerId, dropId));
    if (drop.searchKey !== keep.searchKey) {
      await tx
        .insert(schema.rootBeerAliases)
        .values({ searchKey: drop.searchKey, slug: drop.slug, rootBeerId: keepId, mergedBy: userId })
        .onConflictDoUpdate({ target: schema.rootBeerAliases.searchKey, set: { rootBeerId: keepId, slug: drop.slug } });
    }
    await tx.delete(schema.rootBeers).where(eq(schema.rootBeers.id, dropId));
    if (drop.searchKey === keep.searchKey) {
      // Same name key: only the old link needs a pointer. Keyed by slug so it can't clash with a real name.
      await tx.insert(schema.rootBeerAliases).values({ searchKey: `slug:${drop.slug}`, slug: drop.slug, rootBeerId: keepId, mergedBy: userId }).onConflictDoNothing();
    }
    await clearDismissals(tx, dropId);
    return { slug: keep.slug, movedTastings: both.length };
  });
}

/** Merge place `dropId` into `keepId`: stock reports and "bought it here" links move over. */
export async function mergePlaceInto(dropId: string, keepId: string, userId: string) {
  return db.transaction(async (tx) => {
    const [keep] = await tx.select().from(schema.locations).where(eq(schema.locations.id, keepId));
    const [drop] = await tx.select().from(schema.locations).where(eq(schema.locations.id, dropId));
    if (!keep || !drop) throw new Error("One of these places no longer exists. Refresh and try again.");

    await tx.execute(sql`
      INSERT INTO location_root_beers (location_id, root_beer_id, price_cents, last_seen_on, reported_by)
      SELECT ${keepId}, root_beer_id, price_cents, last_seen_on, reported_by FROM location_root_beers WHERE location_id = ${dropId}
      ON CONFLICT (location_id, root_beer_id) DO UPDATE SET
        last_seen_on = greatest(location_root_beers.last_seen_on, excluded.last_seen_on),
        price_cents = coalesce(location_root_beers.price_cents, excluded.price_cents)`);
    await tx.update(schema.tastings).set({ locationId: keepId }).where(eq(schema.tastings.locationId, dropId));

    const fill: Partial<typeof schema.locations.$inferInsert> = {};
    if (!keep.address && drop.address) fill.address = drop.address;
    if (!keep.category && drop.category) fill.category = drop.category;
    if (!keep.notes && drop.notes) fill.notes = drop.notes;
    if (Object.keys(fill).length) await tx.update(schema.locations).set(fill).where(eq(schema.locations.id, keepId));

    // Earlier merges into the dropped pin now point at the kept one.
    await tx.update(schema.locationTombstones).set({ mergedInto: keepId }).where(eq(schema.locationTombstones.mergedInto, dropId));
    await tx.delete(schema.locations).where(eq(schema.locations.id, dropId));
    // The dropped pin's outside id resolves to the kept place from now on (syncs skip it; search returns the kept pin).
    if (drop.externalId) {
      await tx
        .insert(schema.locationTombstones)
        .values({ externalId: drop.externalId, name: drop.name, deletedBy: userId, mergedInto: keepId })
        .onConflictDoUpdate({ target: schema.locationTombstones.externalId, set: { mergedInto: keepId } });
    }
    await clearDismissals(tx, dropId);
    return { ok: true };
  });
}

async function clearDismissals(tx: Tx, id: string) {
  await tx.execute(sql`DELETE FROM duplicate_dismissals WHERE a_id = ${id} OR b_id = ${id}`);
}

/** Where a name key or old link points after a merge, if anywhere. */
export async function rootBeerAlias(by: { searchKey?: string; slug?: string }, exec: Pick<typeof db, "select"> = db) {
  const where = by.slug ? eq(schema.rootBeerAliases.slug, by.slug) : by.searchKey ? eq(schema.rootBeerAliases.searchKey, by.searchKey) : null;
  if (!where) return null;
  const [row] = await exec
    .select({ id: schema.rootBeers.id, slug: schema.rootBeers.slug })
    .from(schema.rootBeerAliases)
    .innerJoin(schema.rootBeers, eq(schema.rootBeers.id, schema.rootBeerAliases.rootBeerId))
    .where(where);
  return row ?? null;
}
