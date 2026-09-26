import "server-only";
import { and, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { uniqueSlug } from "@/lib/catalog";
import { normalizeName, searchKey } from "@/lib/normalize";
import { fromOpenFoodFacts, fromRootBeerBarrel, normalizeBarcode, type CatalogCandidate } from "./parse";
import { photoMatches } from "./retail-parse";

// Seeds the shared catalog from outside sources. Re-running is safe: entries are matched by
// normalized brand + name, only blank fields are filled in, and member edits are never overwritten.

const UA = "TasteBuds/0.1 (private root beer club app)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ImportResult = { created: number; updated: number; barcodes: number; skipped: number; scanned: number };

// A photo always travels with the exact product it shows; it's only used if photoMatches() agrees.
export type PhotoCandidate = { url: string; title: string; brand?: string | null; source: string; sourceUrl: string | null };
type Entry = CatalogCandidate & { photo?: PhotoCandidate | null; sourceUrl?: string | null; barcodes?: string[] };

function photoFields(photo: PhotoCandidate | null | undefined, entry: { brand: string; name: string }) {
  if (!photo?.url || !photoMatches({ title: photo.title, brand: photo.brand }, entry)) return null;
  return { imageUrl: photo.url, imageSource: photo.source, imageProductTitle: photo.title.slice(0, 200), imageSourceUrl: photo.sourceUrl };
}

export async function upsertCatalogEntry(e: Entry, source: string, userId: string | null): Promise<{ id: string; status: "created" | "updated" | "unchanged"; barcodes: number }> {
  const key = searchKey(e.brand, e.name);
  const [existing] = await db.select().from(schema.rootBeers).where(eq(schema.rootBeers.searchKey, key));
  let id: string;
  let status: "created" | "updated" | "unchanged" = "unchanged";

  if (existing) {
    id = existing.id;
    const fill: Partial<typeof schema.rootBeers.$inferInsert> = {};
    if (!existing.style && e.style) fill.style = e.style;
    if (!existing.sweetener && e.sweetener) fill.sweetener = e.sweetener;
    const pic = !existing.imageUrl && !existing.imageLocked ? photoFields(e.photo, existing) : null;
    if (pic) Object.assign(fill, pic);
    if (!existing.sourceUrl && e.sourceUrl) fill.sourceUrl = e.sourceUrl;
    if (Object.keys(fill).length) {
      await db.update(schema.rootBeers).set(fill).where(eq(schema.rootBeers.id, id));
      status = "updated";
    }
  } else {
    const label = e.name.toLowerCase() === "root beer" ? e.brand : `${e.brand} ${e.name}`;
    const [rb] = await db
      .insert(schema.rootBeers)
      .values({
        brand: e.brand.slice(0, 80),
        name: e.name.slice(0, 80),
        style: e.style,
        sweetener: e.sweetener,
        ...(photoFields(e.photo, { brand: e.brand, name: e.name }) ?? {}),
        source,
        sourceUrl: e.sourceUrl ?? null,
        slug: await uniqueSlug(label),
        searchKey: key,
        createdBy: userId,
      })
      .returning({ id: schema.rootBeers.id });
    id = rb.id;
    status = "created";
  }

  let added = 0;
  for (const raw of e.barcodes ?? []) {
    const barcode = normalizeBarcode(raw);
    if (!barcode) continue;
    const res = await db
      .insert(schema.rootBeerBarcodes)
      .values({ barcode, rootBeerId: id, source, addedBy: userId })
      .onConflictDoNothing()
      .returning({ barcode: schema.rootBeerBarcodes.barcode });
    added += res.length;
  }
  return { id, status, barcodes: added };
}

// ---------- Open Food Facts (open data, ODbL) ----------

type OffProduct = {
  code?: string;
  brands?: string | string[];
  product_name?: string;
  categories_tags?: string[];
  ingredients_text?: string;
  ingredients_tags?: string[];
  image_front_small_url?: string;
  image_front_url?: string;
};

const OFF_FIELDS = "code,brands,product_name,categories_tags,ingredients_text,ingredients_tags,image_front_small_url,image_front_url";

function offEntry(p: OffProduct): Entry | null {
  const c = fromOpenFoodFacts(p);
  if (!c) return null;
  const url = p.image_front_url || p.image_front_small_url || null;
  const brand = (Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(",")[0])?.trim() ?? null;
  return {
    ...c,
    photo: url
      ? { url, title: p.product_name ?? "", brand, source: "openfoodfacts", sourceUrl: p.code ? `https://world.openfoodfacts.org/product/${p.code}` : null }
      : null,
    sourceUrl: p.code ? `https://world.openfoodfacts.org/product/${p.code}` : null,
    barcodes: p.code ? [p.code] : [],
  };
}

async function offSearch(q: string, page: number): Promise<OffProduct[]> {
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page=${page}&page_size=100&fields=${OFF_FIELDS}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) return [];
  return ((await res.json()) as { hits: OffProduct[] }).hits ?? [];
}

export async function importOpenFoodFacts(userId: string): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, barcodes: 0, skipped: 0, scanned: 0 };
  // Open Food Facts asks for no more than ~10 search requests a minute.
  const queries: [string, number][] = [["root beer", 8], ["rootbeer", 1], ["sarsaparilla", 1], ["birch beer", 2]];
  const seen = new Set<string>();
  let first = true;
  for (const [q, maxPages] of queries) {
    for (let page = 1; page <= maxPages; page++) {
      if (!first) await sleep(6500);
      first = false;
      const hits = await offSearch(q, page);
      if (!hits.length) break;
      let relevant = 0;
      for (const p of hits) {
        if (!p.code || seen.has(p.code)) continue;
        seen.add(p.code);
        result.scanned++;
        const entry = offEntry(p);
        if (!entry) {
          result.skipped++;
          continue;
        }
        relevant++;
        const r = await upsertCatalogEntry(entry, "openfoodfacts", userId);
        if (r.status === "created") result.created++;
        else if (r.status === "updated") result.updated++;
        result.barcodes += r.barcodes;
      }
      if (relevant < 5) break; // results have drifted away from root beer
    }
  }
  return result;
}

// ---------- Anthony's Root Beer Barrel (names only, linking back to each review) ----------

// WordPress category ids on rootbeerbarrel.com. "random junk" (1) and the empty 737 are skipped.
const RBB_CATEGORIES: Record<number, { category: "root" | "birch" | "sarsaparilla" | "other"; diet: boolean }> = {
  9: { category: "root", diet: false },
  15: { category: "root", diet: true },
  10: { category: "birch", diet: false },
  19: { category: "birch", diet: true },
  11: { category: "sarsaparilla", diet: false },
  21: { category: "sarsaparilla", diet: true },
  20: { category: "other", diet: false },
};

function decodeEntities(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#039;/g, "'")
    .replace(/<[^>]+>/g, "");
}

export async function importRootBeerBarrel(userId: string): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, barcodes: 0, skipped: 0, scanned: 0 };
  const cats = Object.keys(RBB_CATEGORIES).join(",");
  for (let page = 1; page <= 30; page++) {
    if (page > 1) await sleep(3000); // be gentle with a hobbyist's server
    const url = `https://rootbeerbarrel.com/wp-json/wp/v2/posts?per_page=100&page=${page}&categories=${cats}&_fields=title,link,categories`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60000) });
    } catch {
      await sleep(15000); // one slow retry, then give up (everything saved so far is kept; re-run later to finish)
      res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60000) });
    }
    if (res.status === 400) break; // past the last page
    if (!res.ok) throw new Error(`Root Beer Barrel returned ${res.status}`);
    const posts = (await res.json()) as { title: { rendered: string }; link: string; categories: number[] }[];
    if (!posts.length) break;
    for (const p of posts) {
      result.scanned++;
      const cat = p.categories.map((c) => RBB_CATEGORIES[c]).find(Boolean);
      const c = cat ? fromRootBeerBarrel(decodeEntities(p.title.rendered), cat.category, cat.diet) : null;
      if (!c) {
        result.skipped++;
        continue;
      }
      const r = await upsertCatalogEntry({ ...c, sourceUrl: p.link }, "rootbeerbarrel", userId);
      if (r.status === "created") result.created++;
      else if (r.status === "updated") result.updated++;
    }
    const totalPages = Number(res.headers.get("x-wp-totalpages") ?? page);
    if (page >= totalPages) break;
  }
  return result;
}

// ---------- barcode lookup ----------

export type BarcodeLookup =
  | { status: "found"; rootBeer: { id: string; slug: string; brand: string; name: string }; source: "club" | "openfoodfacts" }
  | { status: "unknown"; barcode: string; suggestion: { brand: string; name: string } | null };

/** Club catalog first; then Open Food Facts (adding the product to the catalog if it's a root beer style drink). */
export async function lookupBarcode(raw: string, userId: string): Promise<BarcodeLookup | { status: "invalid" }> {
  const barcode = normalizeBarcode(raw);
  if (!barcode) return { status: "invalid" };
  const alt = barcode.length === 12 ? `0${barcode}` : barcode;

  const [known] = await db
    .select({ id: schema.rootBeers.id, slug: schema.rootBeers.slug, brand: schema.rootBeers.brand, name: schema.rootBeers.name })
    .from(schema.rootBeerBarcodes)
    .innerJoin(schema.rootBeers, eq(schema.rootBeers.id, schema.rootBeerBarcodes.rootBeerId))
    .where(or(eq(schema.rootBeerBarcodes.barcode, barcode), eq(schema.rootBeerBarcodes.barcode, alt)));
  if (known) return { status: "found", rootBeer: known, source: "club" };

  let suggestion: { brand: string; name: string } | null = null;
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${alt}?fields=${OFF_FIELDS}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = (await res.json()) as { status: number; product?: OffProduct };
      if (data.status === 1 && data.product) {
        const entry = offEntry({ ...data.product, code: data.product.code ?? alt });
        if (entry) {
          const r = await upsertCatalogEntry(entry, "openfoodfacts", userId);
          const [rb] = await db
            .select({ id: schema.rootBeers.id, slug: schema.rootBeers.slug, brand: schema.rootBeers.brand, name: schema.rootBeers.name })
            .from(schema.rootBeers)
            .where(eq(schema.rootBeers.id, r.id));
          return { status: "found", rootBeer: rb, source: "openfoodfacts" };
        }
        const name = data.product.product_name?.trim();
        const brand = (Array.isArray(data.product.brands) ? data.product.brands[0] : data.product.brands?.split(",")[0])?.trim();
        if (brand || name) suggestion = { brand: brand || name || "", name: brand && name ? name : "Root Beer" };
      }
    }
  } catch {
    // Offline or Open Food Facts down: fall through to "unknown" so the member can add it.
  }
  return { status: "unknown", barcode, suggestion };
}

/** Remember that this barcode is this root beer (first member to link it wins). */
export async function linkBarcode(raw: string, rootBeerId: string, userId: string) {
  const barcode = normalizeBarcode(raw);
  if (!barcode) return false;
  const res = await db
    .insert(schema.rootBeerBarcodes)
    .values({ barcode, rootBeerId, source: "member", addedBy: userId })
    .onConflictDoNothing()
    .returning({ barcode: schema.rootBeerBarcodes.barcode });
  return res.length > 0;
}

export async function catalogSourceCounts() {
  const rows = await db.select({ source: schema.rootBeers.source, n: count() }).from(schema.rootBeers).groupBy(schema.rootBeers.source);
  const [{ n: barcodes }] = await db.select({ n: count() }).from(schema.rootBeerBarcodes);
  const [{ n: communityPins }] = await db.select({ n: count() }).from(schema.locations).where(sql`${schema.locations.externalId} LIKE 'rbmap:%'`);
  const [{ n: allPlaces }] = await db.select({ n: count() }).from(schema.locations);
  const [{ n: dismissedPins }] = await db.select({ n: count() }).from(schema.locationTombstones);
  return {
    bySource: Object.fromEntries(rows.map((r) => [r.source, r.n])) as Record<string, number>,
    barcodes,
    communityPins,
    clubPlaces: allPlaces - communityPins,
    dismissedPins,
  };
}


// ---------- Community Root Beer Map (Google My Maps) ----------

export const COMMUNITY_MAP_ID = "12Uk6KfWMgFynILf_vHudZVWDcON-y4IK";

export type MapImportResult = {
  created: number;
  updated: number;
  linked: number;
  skipped: number;
  dismissed: number; // pins an admin deleted earlier, not re-added
  goneFromSource: number; // still on our map, but no longer on theirs
  total: number;
};

/**
 * Syncs pins from the community map into our own locations table.
 * One-way and additive: it adds new pins and refreshes notes on pins that came from that map.
 * It never deletes anything — club-added places are never touched, pins an admin deleted stay deleted,
 * and pins that vanish from the source are kept (just marked). The raw KML is saved as a backup.
 */
export async function importCommunityMap(userId: string, mapId = COMMUNITY_MAP_ID): Promise<MapImportResult> {
  const { parseKml, guessCategory, pinId } = await import("./kml");
  const { searchCatalog } = await import("@/lib/queries");
  const startedAt = new Date();
  const [sync] = await db.insert(schema.sourceSyncs).values({ source: "communitymap", userId, startedAt }).returning({ id: schema.sourceSyncs.id });

  try {
    const res = await fetch(`https://www.google.com/maps/d/kml?mid=${encodeURIComponent(mapId)}&forcekml=1`, {
      headers: { "User-Agent": "Mozilla/5.0 (TasteBuds private club app)" },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`Google returned ${res.status}. The map may be private or gone. Your map is unchanged.`);
    const kml = await res.text();
    const { pins } = parseKml(kml);
    if (!pins.length) throw new Error("The community map came back empty. Your map is unchanged.");
    await db.update(schema.sourceSyncs).set({ snapshot: kml, snapshotBytes: kml.length }).where(eq(schema.sourceSyncs.id, sync.id));

    const dismissed = new Set((await db.select({ id: schema.locationTombstones.externalId }).from(schema.locationTombstones)).map((t) => t.id));
    const result: MapImportResult = { created: 0, updated: 0, linked: 0, skipped: 0, dismissed: 0, goneFromSource: 0, total: pins.length };
    const seen: string[] = [];
    const skippedDismissed = new Set<string>();

    for (const pin of pins) {
      const externalId = pinId(pin);
      if (dismissed.has(externalId)) {
        if (!skippedDismissed.has(externalId)) result.dismissed++;
        skippedDismissed.add(externalId);
        continue;
      }
      seen.push(externalId);
      const [existing] = await db.select().from(schema.locations).where(eq(schema.locations.externalId, externalId));
      let locationId: string;
      if (existing) {
        locationId = existing.id;
        if ((existing.notes ?? null) !== pin.notes && existing.source === "seed") {
          await db.update(schema.locations).set({ notes: pin.notes }).where(eq(schema.locations.id, existing.id));
          result.updated++;
        }
      } else {
        // A member may already have added this place: same name within ~200 m.
        const near = await db.execute(sql`
          SELECT id FROM locations
          WHERE lower(name) = ${pin.name.toLowerCase()} AND abs(lat - ${pin.lat}) < 0.002 AND abs(lng - ${pin.lng}) < 0.003
          LIMIT 1`);
        const dupe = (near as unknown as { rows: { id: string }[] }).rows[0];
        if (dupe) {
          result.skipped++;
          continue;
        }
        const [loc] = await db
          .insert(schema.locations)
          .values({
            name: pin.name,
            lat: pin.lat,
            lng: pin.lng,
            notes: pin.notes,
            category: guessCategory(pin.name),
            externalId,
            source: "seed",
            createdBy: userId,
          })
          .returning({ id: schema.locations.id });
        locationId = loc.id;
        result.created++;
      }

      // Short notes that clearly name a catalog root beer ("Glewwe Castle Root Beer", "Lift bridge on tap")
      // become "carried here" records with an unknown date. Anything else stays as a note.
      const note = pin.notes?.split("\n")[0].replace(/\b(on tap|on draft|house[- ]made|in bottles?)\b/gi, "").trim();
      if (note && note.length >= 3 && note.length <= 60 && !/closed|call|no longer|\?|gone|moved/i.test(note)) {
        // Right brand isn't enough: "Northwoods root beer" must not become "Northwoods Espresso Root Beer".
        // Accept a hit only if all its flavour words appear in the note (plain "Root Beer" always qualifies).
        const noteWords = new Set(normalizeName(note).split(" "));
        const hits = (await searchCatalog(note, 6)).filter((h) => h.score >= 0.7);
        const hit = hits.find((h) => {
          const extra = normalizeName(h.name).split(" ").filter((w) => w && !normalizeName(h.brand).split(" ").includes(w));
          return extra.every((w) => noteWords.has(w));
        });
        if (hit) {
          const ins = await db
            .insert(schema.locationRootBeers)
            .values({ locationId, rootBeerId: hit.id, lastSeenOn: null, reportedBy: userId })
            .onConflictDoNothing()
            .returning({ id: schema.locationRootBeers.locationId });
          result.linked += ins.length;
        }
      }
    }

    // Mark which synced pins are still on the source map. Nothing is deleted.
    for (let i = 0; i < seen.length; i += 500) {
      await db.update(schema.locations).set({ sourceLastSeenAt: startedAt }).where(inArray(schema.locations.externalId, seen.slice(i, i + 500)));
    }
    const [{ n }] = await db
      .select({ n: count() })
      .from(schema.locations)
      .where(sql`${schema.locations.externalId} LIKE 'rbmap:%' AND (${schema.locations.sourceLastSeenAt} IS NULL OR ${schema.locations.sourceLastSeenAt} < ${startedAt})`);
    result.goneFromSource = n;

    await db.update(schema.sourceSyncs).set({ status: "ok", finishedAt: new Date(), result }).where(eq(schema.sourceSyncs.id, sync.id));
    return result;
  } catch (e) {
    await db.update(schema.sourceSyncs).set({ status: "failed", finishedAt: new Date(), error: (e as Error).message }).where(eq(schema.sourceSyncs.id, sync.id));
    throw e;
  }
}

export async function lastSync(source: string) {
  const [row] = await db
    .select({
      id: schema.sourceSyncs.id,
      status: schema.sourceSyncs.status,
      startedAt: schema.sourceSyncs.startedAt,
      finishedAt: schema.sourceSyncs.finishedAt,
      result: schema.sourceSyncs.result,
      error: schema.sourceSyncs.error,
      snapshotBytes: schema.sourceSyncs.snapshotBytes,
      by: schema.users.name,
    })
    .from(schema.sourceSyncs)
    .leftJoin(schema.users, eq(schema.users.id, schema.sourceSyncs.userId))
    .where(eq(schema.sourceSyncs.source, source))
    .orderBy(desc(schema.sourceSyncs.startedAt))
    .limit(1);
  return row ?? null;
}

/** Most recent successful sync that saved a snapshot (the backup copy of the source). */
export async function latestSnapshot(source: string) {
  const [row] = await db
    .select({ snapshot: schema.sourceSyncs.snapshot, startedAt: schema.sourceSyncs.startedAt })
    .from(schema.sourceSyncs)
    .where(and(eq(schema.sourceSyncs.source, source), sql`${schema.sourceSyncs.snapshot} IS NOT NULL`))
    .orderBy(desc(schema.sourceSyncs.startedAt))
    .limit(1);
  return row ?? null;
}

/** Fill in a missing street address the first time someone opens a pin (reverse geocode, then saved). */
export async function fillLocationAddress(locationId: string): Promise<string | null> {
  const [loc] = await db.select().from(schema.locations).where(eq(schema.locations.id, locationId));
  if (!loc) return null;
  if (loc.address) return loc.address;
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${loc.lat}&lon=${loc.lng}&limit=1&lang=en`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { features: { properties: Record<string, string | undefined> }[] };
    const p = data.features[0]?.properties;
    if (!p) return null;
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const address = [street, p.city || p.district || p.county, p.state].filter(Boolean).join(", ");
    if (!address) return null;
    await db.update(schema.locations).set({ address }).where(eq(schema.locations.id, locationId));
    return address;
  } catch {
    return null;
  }
}
