import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { milesBetween } from "./format";

// Place search for "Where did you get it?" and "Add place".
// Local/prototype provider: Photon (OpenStreetMap data, built for search-as-you-type, no key).
// Production: swap searchProvider() for Google Places Autocomplete (New) or Mapbox Search Box —
// everything else (club-place matching, dedupe, saving) stays the same.

export type PlaceHit = {
  externalId: string; // provider-prefixed, e.g. "osm:N822543769"
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string | null;
};

export type Near = { lat: number; lng: number } | null;

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    countrycode?: string;
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
  };
};

const CATEGORY: Record<string, string> = {
  brewery: "Brewery",
  pub: "Pub",
  bar: "Bar",
  restaurant: "Restaurant",
  cafe: "Café",
  fast_food: "Restaurant",
  supermarket: "Grocery",
  convenience: "Convenience store",
  alcohol: "Liquor store",
  beverages: "Drinks shop",
  deli: "Deli",
  general: "Store",
  department_store: "Store",
  wholesale: "Wholesale",
  fuel: "Gas station",
  retail: "Store",
};

function categoryOf(key?: string, value?: string): string | null {
  if (!value) return null;
  if (CATEGORY[value]) return CATEGORY[value];
  if (key === "shop") return "Store";
  if (key === "craft") return value.replace(/_/g, " ");
  return null;
}

function addressOf(p: PhotonFeature["properties"]): string {
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const place = p.city || p.district || p.county;
  const region = [p.state, p.countrycode && p.countrycode !== "US" ? p.country : null].filter(Boolean).join(", ");
  return [street, place, region].filter(Boolean).join(", ");
}

const cache = new Map<string, PlaceHit[]>();

async function searchProvider(q: string, near: Near): Promise<PlaceHit[]> {
  const bias = near ? `&lat=${near.lat.toFixed(3)}&lon=${near.lng.toFixed(3)}` : "";
  const key = `${q.toLowerCase()}|${bias}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=12&lang=en${bias}`;
  const res = await fetch(url, { headers: { "User-Agent": "TasteBuds/0.1 (private root beer club app)" }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) return [];
  const data = (await res.json()) as { features: PhotonFeature[] };

  const out: PlaceHit[] = [];
  for (const f of data.features) {
    const p = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    const name = p.name || [p.housenumber, p.street].filter(Boolean).join(" ");
    if (!name) continue;
    // OSM often maps one business several ways (building + point); keep the first within ~150 m.
    if (out.some((o) => o.name.toLowerCase() === name.toLowerCase() && milesBetween(o, { lat, lng }) < 0.1)) continue;
    out.push({
      externalId: `osm:${(p.osm_type ?? "X").charAt(0)}${p.osm_id ?? `${lat},${lng}`}`,
      name,
      address: addressOf(p),
      lat,
      lng,
      category: categoryOf(p.osm_key, p.osm_value),
    });
    if (out.length >= 6) break;
  }
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  cache.set(key, out);
  return out;
}

export type ClubPlace = { id: string; name: string; address: string | null; lat: number; lng: number; category: string | null; externalId: string | null };

/** Places already on the club map that match the text. */
export async function searchClubPlaces(q: string, near: Near): Promise<ClubPlace[]> {
  const term = q.trim().toLowerCase();
  const res = await db.execute(sql`
    SELECT id, name, address, lat, lng, category, external_id AS "externalId",
      greatest(similarity(lower(name), ${term}), word_similarity(${term}, lower(name || ' ' || coalesce(address, '')))) AS score
    FROM locations
    WHERE lower(name || ' ' || coalesce(address, '')) LIKE ${"%" + term + "%"}
       OR word_similarity(${term}, lower(name || ' ' || coalesce(address, ''))) > 0.45
    ORDER BY score DESC
    LIMIT 8
  `);
  const rows = (res as unknown as { rows: (ClubPlace & { score: number })[] }).rows;
  if (near) rows.sort((a, b) => b.score - a.score || milesBetween(near, a) - milesBetween(near, b));
  return rows.slice(0, 4).map((r) => ({ id: r.id, name: r.name, address: r.address, lat: r.lat, lng: r.lng, category: r.category, externalId: r.externalId }));
}

export async function searchPlaces(q: string, near: Near) {
  const [club, provider] = await Promise.all([searchClubPlaces(q, near), searchProvider(q, near).catch(() => [] as PlaceHit[])]);
  const known = new Set(club.map((c) => c.externalId).filter(Boolean));
  const external = provider.filter(
    (p) => !known.has(p.externalId) && !club.some((c) => c.name.toLowerCase() === p.name.toLowerCase() && milesBetween(c, p) < 0.1),
  );
  return { club, external };
}

type Exec = Pick<typeof db, "select" | "insert" | "execute">;

/** Reuse an existing club location for this provider place (same id, or same name within ~100 m), or create it. */
export async function resolvePlace(place: PlaceHit, userId: string, exec: Exec = db): Promise<string> {
  const [byId] = await exec.select({ id: schema.locations.id }).from(schema.locations).where(eq(schema.locations.externalId, place.externalId));
  if (byId) return byId.id;
  const near = await exec.execute(sql`
    SELECT id, lat, lng FROM locations
    WHERE lower(name) = ${place.name.toLowerCase()}
      AND abs(lat - ${place.lat}) < 0.002 AND abs(lng - ${place.lng}) < 0.003
    LIMIT 1
  `);
  const match = (near as unknown as { rows: { id: string }[] }).rows[0];
  if (match) return match.id;
  const [loc] = await exec
    .insert(schema.locations)
    .values({
      name: place.name,
      address: place.address || null,
      lat: place.lat,
      lng: place.lng,
      category: place.category,
      externalId: place.externalId,
      source: "member",
      createdBy: userId,
    })
    .onConflictDoNothing({ target: schema.locations.externalId })
    .returning({ id: schema.locations.id });
  if (loc) return loc.id;
  const [again] = await exec.select({ id: schema.locations.id }).from(schema.locations).where(eq(schema.locations.externalId, place.externalId));
  return again.id;
}
