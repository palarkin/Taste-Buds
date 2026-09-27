// Turns brewery research output into src/data/verified-brewery-root-beer.json.
// Usage (with `npm run dev` running): node scripts/build-brewery-data.mjs <research_out.json>
import fs from "node:fs";
import pg from "pg";

const [, , input] = process.argv;
const research = JSON.parse(fs.readFileSync(input, "utf8"));
const client = new pg.Client(process.env.DATABASE_URL ?? "postgres://tastebuds:tastebuds@localhost:54329/tastebuds");
await client.connect();
const today = new Date().toISOString().slice(0, 10);
const out = [];
for (const b of research.confirmed) {
  const ids = b.rootBeers.map((r) => r.id);
  const { rows } = await client.query("select brand, name from root_beers where id = any($1)", [ids]);
  const locations = [];
  for (const l of b.locations) {
    let { lat, lng } = l;
    if (lat == null || lng == null) {
      // Fill missing coordinates from the street address.
      const q = encodeURIComponent([l.street, l.city, l.state, l.postal].filter(Boolean).join(", "));
      const res = await fetch(`https://photon.komoot.io/api/?q=${q}&limit=1`, { headers: { "User-Agent": "TasteBuds/0.1" } });
      const f = res.ok ? (await res.json()).features?.[0] : null;
      if (!f) continue;
      [lng, lat] = f.geometry.coordinates;
      await new Promise((r) => setTimeout(r, 600));
    }
    locations.push({ obdbId: l.obdbId, name: l.name, street: l.street ?? null, city: l.city, state: l.state, postal: l.postal ?? null, lat, lng, website: l.website ?? null });
  }
  if (!locations.length || !rows.length) continue;
  out.push({ brand: b.brand, rootBeers: rows, evidence: { url: b.evidence.url, checkedOn: today }, locations });
}
await client.end();
fs.writeFileSync(new URL("../src/data/verified-brewery-root-beer.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(`wrote ${out.length} breweries, ${out.reduce((n, b) => n + b.locations.length, 0)} locations`);
