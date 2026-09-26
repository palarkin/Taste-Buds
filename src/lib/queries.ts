import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeName } from "./normalize";

const { users, rootBeers, tastings, media, favorites, locations, locationRootBeers, purchaseLinks, importBatches } =
  schema;

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  const res = await db.execute(query);
  return (res as unknown as { rows: T[] }).rows;
}

export function listMembers() {
  return db.select().from(users).orderBy(asc(users.createdAt));
}

// ---------- catalog ----------

export type CatalogHit = { id: string; slug: string; brand: string; name: string; score: number };

export async function searchCatalog(q: string, limit = 8): Promise<CatalogHit[]> {
  const key = normalizeName(q) || q.toLowerCase().trim();
  if (!key) return [];
  return rows<CatalogHit>(sql`
    SELECT id, slug, brand, name,
      greatest(similarity(search_key, ${key}), word_similarity(${key}, search_key))::float AS score
    FROM root_beers
    WHERE search_key ILIKE ${"%" + key + "%"}
       OR similarity(search_key, ${key}) > 0.2
       OR word_similarity(${key}, search_key) > 0.4
    ORDER BY score DESC, brand ASC
    LIMIT ${limit}
  `);
}

// ---------- directory / leaderboard ----------

export type DirectoryRow = {
  id: string;
  slug: string;
  brand: string;
  name: string;
  style: string | null;
  sweetener: string | null;
  origin: string | null;
  image_url: string | null;
  discontinued: boolean;
  created_at: string;
  my_rating: number | null;
  my_tasting_id: string | null;
  is_favorite: boolean;
  avg_rating: number | null;
  rater_count: number;
  min_rating: number | null;
  max_rating: number | null;
  link_count: number;
  best_unit_price_cents: number | null;
  location_count: number;
  thumb_url: string | null;
};

/** Every catalog entry with the viewer's status and group aggregates. Filtering/sorting happens in the page. */
export async function directoryRows(userId: string): Promise<DirectoryRow[]> {
  const result = await rows<DirectoryRow>(sql`
    SELECT rb.id, rb.slug, rb.brand, rb.name, rb.style, rb.sweetener, rb.origin, rb.image_url,
      rb.discontinued, rb.created_at::text AS created_at,
      mine.rating::float AS my_rating, mine.id AS my_tasting_id,
      (fav.user_id IS NOT NULL) AS is_favorite,
      agg.avg_rating::float AS avg_rating, coalesce(agg.rater_count, 0)::int AS rater_count,
      agg.min_rating::float AS min_rating, agg.max_rating::float AS max_rating,
      coalesce(links.link_count, 0)::int AS link_count, links.best_unit_price_cents::int AS best_unit_price_cents,
      coalesce(locs.location_count, 0)::int AS location_count,
      coalesce(rb.image_url, thumb.url) AS thumb_url
    FROM root_beers rb
    LEFT JOIN tastings mine ON mine.root_beer_id = rb.id AND mine.user_id = ${userId}
    LEFT JOIN favorites fav ON fav.root_beer_id = rb.id AND fav.user_id = ${userId}
    LEFT JOIN (
      SELECT root_beer_id, avg(rating) AS avg_rating, count(*) AS rater_count,
        min(rating) AS min_rating, max(rating) AS max_rating
      FROM tastings GROUP BY root_beer_id
    ) agg ON agg.root_beer_id = rb.id
    LEFT JOIN (
      SELECT root_beer_id, count(*) AS link_count, min(round(price_cents::numeric / pack_size)) AS best_unit_price_cents
      FROM purchase_links GROUP BY root_beer_id
    ) links ON links.root_beer_id = rb.id
    LEFT JOIN (
      SELECT root_beer_id, count(*) AS location_count FROM location_root_beers GROUP BY root_beer_id
    ) locs ON locs.root_beer_id = rb.id
    LEFT JOIN LATERAL (
      SELECT m.url FROM media m JOIN tastings t ON t.id = m.tasting_id
      WHERE t.root_beer_id = rb.id AND m.kind = 'image'
      ORDER BY (t.user_id = ${userId}) DESC, m.sort_order, m.created_at LIMIT 1
    ) thumb ON true
  `);
  return result;
}

export async function distinctValues(column: "style" | "sweetener"): Promise<string[]> {
  const col = column === "style" ? rootBeers.style : rootBeers.sweetener;
  const res = await db
    .selectDistinct({ v: col })
    .from(rootBeers)
    .where(sql`${col} IS NOT NULL AND ${col} <> ''`)
    .orderBy(asc(col));
  return res.map((r) => r.v!).filter(Boolean);
}

// ---------- my log ----------

export async function myLog(userId: string) {
  return rows<{
    id: string;
    rating: number;
    notes: string | null;
    tasted_on: string | null;
    created_at: string;
    source: "manual" | "import";
    root_beer_id: string;
    slug: string;
    brand: string;
    name: string;
    is_favorite: boolean;
    media_count: number;
    thumb_url: string | null;
    thumb_kind: "image" | "video" | null;
    style: string | null;
    place_name: string | null;
    purchased_from: string | null;
    purchased_on: string | null;
  }>(sql`
    SELECT t.id, t.rating::float AS rating, t.notes, t.tasted_on::text AS tasted_on, t.created_at::text AS created_at, t.source,
      rb.id AS root_beer_id, rb.slug, rb.brand, rb.name, rb.style,
      loc.name AS place_name, t.purchased_from, t.purchased_on::text AS purchased_on,
      (fav.user_id IS NOT NULL) AS is_favorite,
      (SELECT count(*) FROM media m WHERE m.tasting_id = t.id)::int AS media_count,
      coalesce(rb.image_url, first_media.url) AS thumb_url, CASE WHEN rb.image_url IS NOT NULL THEN 'image' ELSE first_media.kind END AS thumb_kind
    FROM tastings t
    JOIN root_beers rb ON rb.id = t.root_beer_id
    LEFT JOIN locations loc ON loc.id = t.location_id
    LEFT JOIN favorites fav ON fav.root_beer_id = rb.id AND fav.user_id = t.user_id
    LEFT JOIN LATERAL (
      SELECT url, kind FROM media m WHERE m.tasting_id = t.id ORDER BY (m.kind = 'image') DESC, sort_order, created_at LIMIT 1
    ) first_media ON true
    WHERE t.user_id = ${userId}
  `);
}

export async function getTasting(id: string) {
  const [row] = await db
    .select({ tasting: tastings, rootBeer: rootBeers, location: locations })
    .from(tastings)
    .innerJoin(rootBeers, eq(rootBeers.id, tastings.rootBeerId))
    .leftJoin(locations, eq(locations.id, tastings.locationId))
    .where(eq(tastings.id, id));
  if (!row) return null;
  const items = await db
    .select()
    .from(media)
    .where(eq(media.tastingId, id))
    .orderBy(asc(media.sortOrder), asc(media.createdAt));
  return { ...row, media: items };
}

export async function getMyTastingFor(userId: string, rootBeerId: string) {
  const [row] = await db
    .select({ id: tastings.id })
    .from(tastings)
    .where(and(eq(tastings.userId, userId), eq(tastings.rootBeerId, rootBeerId)));
  return row ?? null;
}

// ---------- root beer detail ----------

export async function rootBeerDetail(slug: string, userId: string) {
  const [rb] = await db.select().from(rootBeers).where(eq(rootBeers.slug, slug));
  if (!rb) return null;
  const [group, links, spots, fav, gallery] = await Promise.all([
    // Members who turned off "show my name" still count toward the average, but appear anonymously
    // (no name, notes or link to their entry) — except to themselves.
    rows<{
      tasting_id: string;
      user_id: string;
      name: string;
      color: string;
      rating: number;
      notes: string | null;
      tasted_on: string | null;
      shared: boolean;
    }>(sql`
      SELECT t.id AS tasting_id, u.id AS user_id, u.name, u.color, t.rating::float AS rating, t.notes,
        t.tasted_on::text AS tasted_on, (u.share_ratings OR u.id = ${userId}) AS shared
      FROM tastings t JOIN users u ON u.id = t.user_id
      WHERE t.root_beer_id = ${rb.id}
      ORDER BY t.rating DESC, t.updated_at DESC
    `),
    db
      .select({ link: purchaseLinks, addedBy: users.name })
      .from(purchaseLinks)
      .leftJoin(users, eq(users.id, purchaseLinks.addedBy))
      .where(eq(purchaseLinks.rootBeerId, rb.id))
      .orderBy(sql`round(${purchaseLinks.priceCents}::numeric / ${purchaseLinks.packSize})`),
    db
      .select({ location: locations, priceCents: locationRootBeers.priceCents, lastSeenOn: locationRootBeers.lastSeenOn })
      .from(locationRootBeers)
      .innerJoin(locations, eq(locations.id, locationRootBeers.locationId))
      .where(eq(locationRootBeers.rootBeerId, rb.id))
      .orderBy(sql`${locationRootBeers.lastSeenOn} DESC NULLS LAST`),
    db
      .select()
      .from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.rootBeerId, rb.id))),
    rows<{ id: string; url: string; kind: "image" | "video"; member: string }>(sql`
      SELECT m.id, m.url, m.kind, u.name AS member
      FROM media m JOIN tastings t ON t.id = m.tasting_id JOIN users u ON u.id = t.user_id
      WHERE t.root_beer_id = ${rb.id} AND (u.share_ratings OR u.id = ${userId})
      ORDER BY (t.user_id = ${userId}) DESC, m.sort_order, m.created_at
      LIMIT 24
    `),
  ]);
  const mine = group.find((g) => g.user_id === userId) ?? null;
  // Strip identifying details from members who keep their ratings anonymous.
  const anonymized = group.map((g) => (g.shared ? g : { ...g, name: "Club member", color: "#a8a29e", notes: null, tasted_on: null, tasting_id: "" }));
  const avg = group.length ? group.reduce((s, g) => s + g.rating, 0) / group.length : null;
  return { rb, group: anonymized, mine, avg, links, spots, isFavorite: fav.length > 0, gallery };
}

// ---------- locations ----------

export type MapLocation = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  notes: string | null;
  category: string | null;
  fromCommunityMap: boolean;
  goneFromSourceSince: string | null; // last date the community map still had it, if it's gone now
  items: { root_beer_id: string; slug: string; brand: string; name: string; price_cents: number | null; last_seen_on: string | null; tasted: boolean; my_rating: number | null; is_favorite: boolean }[];
};

export async function mapLocations(userId: string): Promise<MapLocation[]> {
  const [locs, [lastOk]] = await Promise.all([
    db.select().from(locations).orderBy(asc(locations.name)),
    db
      .select({ startedAt: schema.sourceSyncs.startedAt })
      .from(schema.sourceSyncs)
      .where(and(eq(schema.sourceSyncs.source, "communitymap"), eq(schema.sourceSyncs.status, "ok")))
      .orderBy(desc(schema.sourceSyncs.startedAt))
      .limit(1),
  ]);
  const items = await rows<MapLocation["items"][number] & { location_id: string }>(sql`
    SELECT lrb.location_id, rb.id AS root_beer_id, rb.slug, rb.brand, rb.name, lrb.price_cents, lrb.last_seen_on::text AS last_seen_on,
      (t.id IS NOT NULL) AS tasted, t.rating::float AS my_rating, (f.user_id IS NOT NULL) AS is_favorite
    FROM location_root_beers lrb
    JOIN root_beers rb ON rb.id = lrb.root_beer_id
    LEFT JOIN tastings t ON t.root_beer_id = rb.id AND t.user_id = ${userId}
    LEFT JOIN favorites f ON f.root_beer_id = rb.id AND f.user_id = ${userId}
    ORDER BY (t.id IS NULL) DESC, lrb.last_seen_on DESC NULLS LAST, rb.brand
  `);
  const byLoc = new Map<string, MapLocation["items"]>();
  for (const { location_id, ...it } of items) {
    const arr = byLoc.get(location_id) ?? [];
    arr.push(it);
    byLoc.set(location_id, arr);
  }
  return locs.map((l) => ({
    id: l.id,
    name: l.name,
    address: l.address,
    lat: l.lat,
    lng: l.lng,
    notes: l.notes,
    category: l.category,
    fromCommunityMap: l.externalId?.startsWith("rbmap:") ?? false,
    goneFromSourceSince:
      l.externalId?.startsWith("rbmap:") && lastOk && l.sourceLastSeenAt && l.sourceLastSeenAt < lastOk.startedAt
        ? l.sourceLastSeenAt.toISOString().slice(0, 10)
        : null,
    items: byLoc.get(l.id) ?? [],
  }));
}

// ---------- import ----------

export function importHistory(userId: string) {
  return db.select().from(importBatches).where(eq(importBatches.userId, userId)).orderBy(desc(importBatches.createdAt));
}
