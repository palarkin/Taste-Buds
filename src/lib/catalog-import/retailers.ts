import "server-only";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { searchCatalog } from "@/lib/queries";
import { upsertCatalogEntry } from "./index";
import { splitLabel } from "@/lib/import/parse";
import { cleanProductTitle, isRootBeerProduct, packSize, photoMatches, productMatches } from "./retail-parse";
import { peelVariety } from "./parse";

// Finds where root beers can be bought online from credible specialty soda retailers.
// Each store's public product catalog is downloaded once per sync and matched locally
// (a few dozen requests in total), producing real product pages with prices and photos.

type Retailer = {
  key: string;
  name: string;
  note: string; // why it's credible, shown under the link
  rank: number; // lower = more credible, preferred when capping at 3
  kind: "shopify" | "woocommerce";
  base: string;
};

// Ranked by credibility: a century-old soda institution first, then dedicated craft-soda sellers.
export const RETAILERS: Retailer[] = [
  { key: "galcos", name: "Galco's Soda Pop Stop", note: "Los Angeles soda institution since 1897", rank: 1, kind: "woocommerce", base: "https://sodapopstop.com" },
  { key: "beveragesdirect", name: "Beverages Direct", note: "Dedicated online soda retailer", rank: 2, kind: "shopify", base: "https://www.beveragesdirect.com" },
  { key: "sodapoponline", name: "Soda Pop Shop", note: "San Diego craft soda shop", rank: 3, kind: "shopify", base: "https://www.sodapoponline.com" },
  { key: "yaysoda", name: "Yay Soda", note: "Craft soda shop", rank: 4, kind: "shopify", base: "https://www.yaysoda.com" },
  { key: "blooms", name: "Blooms Candy & Soda Pop Shop", note: "Candy & soda shop, 400+ sodas", rank: 5, kind: "shopify", base: "https://www.candycarrollton.com" },
];

const MAX_LINKS = 3;
const UA = "Mozilla/5.0 (TasteBuds private root beer club; catalog match)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Offer = {
  retailer: Retailer;
  title: string;
  vendor: string | null;
  url: string;
  priceCents: number;
  packSize: number;
  inStock: boolean;
  image: string | null;
};

type ShopifyProduct = {
  title: string;
  handle: string;
  vendor?: string;
  images?: { src: string }[];
  variants: { title: string; price: string; available?: boolean }[];
};

type WooProduct = {
  name: string;
  permalink: string;
  prices: { price: string; currency_minor_unit: number };
  images?: { src: string }[];
  is_in_stock?: boolean;
};

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#8217;|&#039;/g, "'").replace(/&#8211;/g, "-").replace(/&quot;/g, '"');

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return (await res.json()) as T;
}

async function fetchOffers(r: Retailer): Promise<Offer[]> {
  const offers: Offer[] = [];
  if (r.kind === "shopify") {
    for (let page = 1; page <= 40; page++) {
      const { products } = await getJson<{ products: ShopifyProduct[] }>(`${r.base}/products.json?limit=250&page=${page}`);
      if (!products.length) break;
      for (const p of products) {
        if (!isRootBeerProduct(p.title)) continue;
        // One offer per product: the variant with the best price per bottle, preferring in-stock ones.
        const variants = p.variants
          .map((v) => ({ v, pack: packSize(p.title, v.title), cents: Math.round(Number(v.price) * 100) }))
          .filter((x) => x.cents > 0)
          .sort((a, b) => Number(b.v.available !== false) - Number(a.v.available !== false) || a.pack - b.pack || a.cents - b.cents);
        const best = variants[0];
        if (!best) continue;
        offers.push({
          retailer: r,
          title: decode(p.title),
          vendor: p.vendor ?? null,
          url: `${r.base}/products/${p.handle}`,
          priceCents: best.cents,
          packSize: best.pack,
          inStock: best.v.available !== false,
          image: p.images?.[0]?.src ?? null,
        });
      }
      await sleep(800);
    }
  } else {
    for (let page = 1; page <= 30; page++) {
      const products = await getJson<WooProduct[]>(`${r.base}/wp-json/wc/store/v1/products?per_page=100&page=${page}`);
      if (!products.length) break;
      for (const p of products) {
        const title = decode(p.name);
        if (!isRootBeerProduct(title)) continue;
        const cents = Math.round(Number(p.prices.price) / 10 ** (p.prices.currency_minor_unit - 2));
        if (!cents) continue;
        offers.push({
          retailer: r,
          title,
          vendor: null,
          url: p.permalink,
          priceCents: cents,
          packSize: packSize(title),
          inStock: p.is_in_stock !== false,
          image: p.images?.[0]?.src ?? null,
        });
      }
      await sleep(800);
    }
  }
  return offers;
}

// Store names used as "vendor" on their own products carry no brand information.
const STORE_VENDORS = /beverages direct|blooms|soda pop shop|yay soda|galco/i;

async function matchOffer(o: Offer): Promise<{ id: string; score: number } | null> {
  const vendor = o.vendor && !STORE_VENDORS.test(o.vendor) ? o.vendor : null;
  const hits = await searchCatalog(`${vendor && !o.title.toLowerCase().includes(vendor.toLowerCase()) ? vendor + " " : ""}${o.title}`, 10);
  const match = hits.find((h) => productMatches({ title: o.title, vendor }, h));
  if (match) return { id: match.id, score: match.score };
  return hits[0] ? { id: "", score: hits[0].score } : null;
}

export type RetailResult = {
  offers: number;
  matched: number;
  rootBeersWithLinks: number;
  links: number;
  imagesAdded: number;
  newRootBeers: number;
  unmatched: number;
  failedStores: string[];
};

export async function syncRetailers(userId: string): Promise<RetailResult> {
  const result: RetailResult = { offers: 0, matched: 0, rootBeersWithLinks: 0, links: 0, imagesAdded: 0, newRootBeers: 0, unmatched: 0, failedStores: [] };
  const all: Offer[] = [];
  for (const r of RETAILERS) {
    try {
      all.push(...(await fetchOffers(r)));
    } catch (e) {
      result.failedStores.push(`${r.name} (${(e as Error).message})`);
    }
  }
  result.offers = all.length;

  // Match every offer to a catalog entry. Clearly-new products (nothing close in the catalog) are added.
  const byRootBeer = new Map<string, Offer[]>();
  for (const o of all) {
    const m = await matchOffer(o);
    let id = m?.id || null;
    if (!id && (!m || m.score < 0.45)) {
      const vendor = o.vendor && !STORE_VENDORS.test(o.vendor) ? o.vendor : null;
      const cleaned = cleanProductTitle(o.title);
      const raw = vendor && cleaned.toLowerCase().startsWith(vendor.toLowerCase())
        ? { brand: vendor, name: cleaned.slice(vendor.length).trim() || "Root Beer" }
        : splitLabel(cleaned);
      const split = peelVariety(raw.brand, raw.name);
      if (split.brand.length >= 2) {
        const created = await upsertCatalogEntry(
          {
            brand: split.brand,
            name: split.name.replace(/^[-–:,\s]+/, "") || "Root Beer",
            style: null,
            sweetener: null,
            photo: o.image ? { url: o.image, title: o.title, brand: vendor, source: `retailer:${o.retailer.name}`, sourceUrl: o.url } : null,
            sourceUrl: o.url,
          },
          "retailer",
          userId,
        );
        if (created.status === "created") result.newRootBeers++;
        id = created.id;
      }
    }
    if (!id) {
      result.unmatched++;
      continue;
    }
    result.matched++;
    byRootBeer.set(id, [...(byRootBeer.get(id) ?? []), o]);
  }

  // Remove links from earlier syncs and the old demo links, then write fresh ones.
  await db.delete(schema.purchaseLinks).where(eq(schema.purchaseLinks.source, "retailer"));
  await db.delete(schema.purchaseLinks).where(like(schema.purchaseLinks.shippingNote, "Demo price%"));
  const memberLinks = await db
    .select({ rootBeerId: schema.purchaseLinks.rootBeerId })
    .from(schema.purchaseLinks)
    .where(eq(schema.purchaseLinks.source, "member"));
  const memberCount = new Map<string, number>();
  for (const l of memberLinks) memberCount.set(l.rootBeerId, (memberCount.get(l.rootBeerId) ?? 0) + 1);

  const today = new Date().toISOString().slice(0, 10);
  // Root beers still without a photo (and not locked by an admin), with their names for the photo check.
  const needImage = new Map(
    (
      await db
        .select({ id: schema.rootBeers.id, brand: schema.rootBeers.brand, name: schema.rootBeers.name })
        .from(schema.rootBeers)
        .where(and(inArray(schema.rootBeers.id, [...byRootBeer.keys()]), sql`${schema.rootBeers.imageUrl} IS NULL`, eq(schema.rootBeers.imageLocked, false)))
    ).map((r) => [r.id, r]),
  );

  for (const [rootBeerId, offers] of byRootBeer) {
    // Then most credible stores first.
    const perStore = new Map<string, Offer>();
    // Best offer per store: in stock first, then a normal-sized pack (a single or 12-pack beats a 96-bottle case).
    for (const o of offers.sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.packSize - b.packSize || a.priceCents - b.priceCents)) {
      if (!perStore.has(o.retailer.key)) perStore.set(o.retailer.key, o);
    }
    const slots = Math.max(0, MAX_LINKS - (memberCount.get(rootBeerId) ?? 0)); // club-added links count toward the 3
    const chosen = [...perStore.values()].sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.retailer.rank - b.retailer.rank).slice(0, slots);
    for (const o of chosen) {
      await db.insert(schema.purchaseLinks).values({
        rootBeerId,
        retailer: o.retailer.name,
        url: o.url,
        priceCents: o.priceCents,
        packSize: o.packSize,
        shippingNote: o.inStock ? o.retailer.note : `${o.retailer.note} · sold out when checked`,
        lastCheckedOn: today,
        source: "retailer",
        inStock: o.inStock,
        addedBy: userId,
      });
      result.links++;
    }
    if (chosen.length) result.rootBeersWithLinks++;

    const entry = needImage.get(rootBeerId);
    if (entry) {
      // Only a photo from a listing of exactly this product (same variant words) is used.
      const vendorOf = (o: Offer) => (o.vendor && !STORE_VENDORS.test(o.vendor) ? o.vendor : null);
      const pick = [...offers]
        .sort((a, b) => a.retailer.rank - b.retailer.rank)
        .find((o) => o.image && photoMatches({ title: o.title, brand: vendorOf(o) }, entry));
      if (pick) {
        await db
          .update(schema.rootBeers)
          .set({ imageUrl: pick.image, imageSource: `retailer:${pick.retailer.name}`, imageProductTitle: pick.title.slice(0, 200), imageSourceUrl: pick.url })
          .where(eq(schema.rootBeers.id, rootBeerId));
        result.imagesAdded++;
      }
    }
  }
  return result;
}
