import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/session";

// Download every place on the Taste Buds map (community-map pins and club-added places) as KML or CSV.
// KML opens in Google My Maps / Google Earth, so the map can be rebuilt anywhere.

type Row = {
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  category: string | null;
  notes: string | null;
  origin: string;
  root_beers: string | null;
};

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const csv = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(request: Request) {
  if (!(await getCurrentUser())) return new Response("Not signed in", { status: 401 });
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "kml";

  const res = await db.execute(sql`
    SELECT l.name, l.address, l.lat, l.lng, l.category, l.notes,
      CASE WHEN l.external_id LIKE 'rbmap:%' THEN 'Community Root Beer Map' ELSE 'Added by the club' END AS origin,
      string_agg(rb.brand || CASE WHEN rb.name <> 'Root Beer' THEN ' ' || rb.name ELSE '' END
        || CASE WHEN lrb.last_seen_on IS NOT NULL THEN ' (seen ' || lrb.last_seen_on || ')' ELSE '' END, '; ' ORDER BY rb.brand) AS root_beers
    FROM locations l
    LEFT JOIN location_root_beers lrb ON lrb.location_id = l.id
    LEFT JOIN root_beers rb ON rb.id = lrb.root_beer_id
    GROUP BY l.id
    ORDER BY origin, l.name
  `);
  const rows = (res as unknown as { rows: Row[] }).rows;
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const header = ["name", "address", "latitude", "longitude", "type", "root_beers", "notes", "origin"];
    const body = rows.map((r) => [r.name, r.address, r.lat, r.lng, r.category, r.root_beers, r.notes, r.origin].map(csv).join(","));
    return new Response([header.join(","), ...body].join("\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="taste-buds-places-${stamp}.csv"` },
    });
  }

  const folder = (title: string, list: Row[]) => `
    <Folder><name>${xml(title)}</name>${list
      .map(
        (r) => `
      <Placemark><name>${xml(r.name)}</name><description>${xml(
        [r.category, r.address, r.root_beers ? `Root beers: ${r.root_beers}` : null, r.notes].filter(Boolean).join("\n"),
      )}</description><Point><coordinates>${r.lng},${r.lat},0</coordinates></Point></Placemark>`,
      )
      .join("")}
    </Folder>`;
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Taste Buds places (${stamp})</name>${folder(
    "Added by the club",
    rows.filter((r) => r.origin === "Added by the club"),
  )}${folder("From the Community Root Beer Map", rows.filter((r) => r.origin !== "Added by the club"))}
</Document></kml>`;
  return new Response(kml, {
    headers: {
      "Content-Type": "application/vnd.google-earth.kml+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="taste-buds-places-${stamp}.kml"`,
    },
  });
}
