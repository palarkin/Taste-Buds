import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { searchKey } from "@/lib/normalize";
import verified from "@/data/verified-brewery-root-beer.json";

// Breweries confirmed to have their own root beer: the root beer is in our catalog (from a published
// review) AND the brewery's own website mentions root beer. The evidence lives in
// src/data/verified-brewery-root-beer.json (built by scripts/research-breweries.mjs); this adds those
// breweries to the map without duplicating places that are already there.

type Verified = {
  brand: string;
  rootBeers: { brand: string; name: string }[];
  evidence: { url: string; checkedOn: string };
  locations: { obdbId: string; name: string; street: string | null; city: string; state: string; postal: string | null; lat: number; lng: number; website: string | null }[];
};

export const VERIFIED_BREWERIES = verified as Verified[];

export type BreweryImportResult = { added: number; alreadyOnMap: number; rootBeersLinked: number; total: number };

export async function importVerifiedBreweries(userId: string): Promise<BreweryImportResult> {
  const result: BreweryImportResult = { added: 0, alreadyOnMap: 0, rootBeersLinked: 0, total: 0 };
  for (const b of VERIFIED_BREWERIES) {
    // Resolve the brewery's root beers in this database by name (ids differ between databases).
    const rootBeerIds: string[] = [];
    for (const rb of b.rootBeers) {
      const [row] = await db.select({ id: schema.rootBeers.id }).from(schema.rootBeers).where(eq(schema.rootBeers.searchKey, searchKey(rb.brand, rb.name)));
      if (row) rootBeerIds.push(row.id);
    }
    const checked = new Date(`${b.evidence.checkedOn}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    // Only breweries with a root beer of their own in the catalog are described as brewing it; the rest serve one.
    const lead = b.rootBeers.length ? "Brews its own root beer. Root beer is listed" : "Serves root beer. It's listed";
    const note = `${lead} on the brewery's website (checked ${checked}): ${b.evidence.url}\nCall ahead to confirm it's pouring.`;

    for (const loc of b.locations) {
      result.total++;
      const externalId = `obdb:${loc.obdbId}`;
      // Already on the map? Same Open Brewery DB id, or same-ish name within ~250 m (e.g. from the community map).
      const near = await db.execute(sql`
        SELECT id FROM locations
        WHERE external_id = ${externalId}
           OR (abs(lat - ${loc.lat}) < 0.0025 AND abs(lng - ${loc.lng}) < 0.0035
               AND similarity(lower(name), ${loc.name.toLowerCase()}) > 0.35)
        LIMIT 1`);
      let locationId = (near as unknown as { rows: { id: string }[] }).rows[0]?.id;
      if (locationId) {
        result.alreadyOnMap++;
      } else {
        const [row] = await db
          .insert(schema.locations)
          .values({
            name: loc.name,
            address: [loc.street, loc.city, [loc.state, loc.postal].filter(Boolean).join(" ")].filter(Boolean).join(", "),
            lat: loc.lat,
            lng: loc.lng,
            category: "Brewery / pub",
            notes: note,
            externalId,
            source: "seed",
            sourceLastSeenAt: null,
            createdBy: userId,
          })
          .onConflictDoNothing({ target: schema.locations.externalId })
          .returning({ id: schema.locations.id });
        if (!row) continue;
        locationId = row.id;
        result.added++;
      }
      for (const rootBeerId of rootBeerIds) {
        const ins = await db
          .insert(schema.locationRootBeers)
          .values({ locationId, rootBeerId, lastSeenOn: null, reportedBy: userId })
          .onConflictDoNothing()
          .returning({ id: schema.locationRootBeers.locationId });
        result.rootBeersLinked += ins.length;
      }
    }
  }
  return result;
}
