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

// ---------- areas (map search: city, state/province, zip/postal code, county, country…) ----------

export type AreaHit = {
  id: string;
  name: string;
  detail: string; // e.g. "City · Minnesota, United States"
  lat: number;
  lng: number;
  bbox: [number, number, number, number] | null; // west, south, east, north
};

const AREA_KIND: Record<string, string> = {
  country: "Country",
  state: "State",
  province: "Province",
  region: "Region",
  territory: "Territory",
  county: "County",
  district: "District",
  municipality: "Municipality",
  city: "City",
  town: "Town",
  village: "Village",
  hamlet: "Hamlet",
  suburb: "Neighborhood",
  neighbourhood: "Neighborhood",
  quarter: "Neighborhood",
  borough: "Borough",
  island: "Island",
};

const areaCache = new Map<string, AreaHit[]>();

/** Places to jump the map to. Only real areas (osm "place" features), not lakes, parks or buildings. */
export async function searchAreas(q: string, rawNear: Near): Promise<AreaHit[]> {
  // A map that hasn't laid out yet reports 0,0 (the Atlantic off Africa): don't bias toward that.
  // Until the map knows where it's looking, lean toward the middle of the US (where the club is).
  // (A gentle lean: a strong one would put Minneapolis, Kansas ahead of Minneapolis, Minnesota.)
  const known = !!rawNear && (Math.abs(rawNear.lat) > 0.01 || Math.abs(rawNear.lng) > 0.01);
  const near = known ? rawNear! : { lat: 39.8, lng: -98.6 };
  // Higher scale = lean less on location, more on how prominent the place is.
  const bias = `&lat=${near.lat.toFixed(2)}&lon=${near.lng.toFixed(2)}&location_bias_scale=${known ? 0.5 : 0.8}`;
  const key = `${q.toLowerCase()}|${bias}`;
  const cached = areaCache.get(key);
  if (cached) return cached;
  const layers = ["city", "state", "country", "county", "district", "locality", "other"].map((l) => `&layer=${l}`).join("");
  // Counties are indexed without the word "County" ("Hennepin", not "Hennepin County").
  const countyOnly = /\s+(county|parish|borough)$/i.test(q.trim());
  const term = countyOnly ? q.trim().replace(/\s+(county|parish|borough)$/i, "") : q;
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(term)}&limit=15&lang=en${layers}${bias}`;
  const res = await fetch(url, { headers: { "User-Agent": "TasteBuds/0.1 (private root beer club app)" }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) return [];
  const data = (await res.json()) as { features: (PhotonFeature & { properties: { extent?: [number, number, number, number]; type?: string } })[] };
  const out: AreaHit[] = [];
  for (const f of data.features) {
    const p = f.properties;
    if (p.osm_key !== "place" || !p.name) continue;
    if (countyOnly && p.osm_value !== "county") continue;
    const isPostcode = p.osm_value === "postcode";
    const kind = isPostcode ? (p.countrycode === "US" ? "ZIP code" : "Postal code") : (AREA_KIND[p.osm_value ?? ""] ?? AREA_KIND[p.type ?? ""] ?? "Area");
    const within = [isPostcode ? p.city || p.county : p.osm_value === "city" || p.osm_value === "town" ? null : p.county, p.state, p.country].filter(
      (x, i, all) => x && x !== p.name && all.indexOf(x) === i,
    );
    const detail = [kind, within.join(", ")].filter(Boolean).join(" · ");
    if (out.some((o) => o.detail === detail && (o.name === p.name || o.name === `${p.name} County`))) continue;
    const [lng, lat] = f.geometry.coordinates;
    // Photon's extent is [minLon, maxLat, maxLon, minLat].
    const e = p.extent;
    const name = p.osm_value === "county" && !/county|parish|borough/i.test(p.name) && p.countrycode === "US" ? `${p.name} County` : p.name;
    out.push({ id: `${p.osm_type ?? "X"}${p.osm_id ?? `${lat},${lng}`}`, name, detail, lat, lng, bbox: e ? [e[0], e[3], e[2], e[1]] : null });
    if (out.length >= 7) break;
  }
  // The same code exists in many countries (55401 is Minneapolis and a town in Ukraine): exact matches, nearest first.
  const from = near;
  const isCode = (a: AreaHit) => /^(ZIP|Postal) code/.test(a.detail);
  const exact = (a: AreaHit) => Number(a.name.replace(/\s/g, "").toLowerCase() !== q.replace(/\s/g, "").toLowerCase());
  const codes = out.filter(isCode).sort((a, b) => exact(a) - exact(b) || milesBetween(from, a) - milesBetween(from, b));
  const sorted = out.map((a) => (isCode(a) ? codes.shift()! : a));
  if (areaCache.size > 500) areaCache.delete(areaCache.keys().next().value!);
  areaCache.set(key, sorted);
  return sorted;
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
  const [merged] = await exec
    .select({ id: schema.locationTombstones.mergedInto })
    .from(schema.locationTombstones)
    .where(eq(schema.locationTombstones.externalId, place.externalId));
  if (merged?.id) return merged.id;
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
