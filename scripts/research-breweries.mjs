import fs from "node:fs";
const S = process.argv[2];
const rows = JSON.parse(fs.readFileSync(`${S}/brewery_candidates.json`, "utf8"));
const UA = "Mozilla/5.0 (Macintosh) TasteBuds/0.1 (private root beer club; checking whether breweries list root beer)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const COMPANY = new Set(["co", "company", "brewing", "brewery", "breweries", "brewpub", "brew", "pub", "brewhouse", "house", "beer", "the", "and", "inc", "llc", "works", "taproom", "tap", "room", "brewers", "ale", "restaurant", "grill", "kitchen"]);
const words = (s) => s.toLowerCase().replace(/&/g, " and ").replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
const core = (s) => words(s).filter((w) => !COMPANY.has(w));
const RB = /\b(root ?beer|birch ?beer|sarsaparilla|sasparilla)\b/i;
const PATHS = ["", "/menu", "/menus", "/beers", "/beer", "/our-beers", "/on-tap", "/taproom", "/drinks", "/food", "/food-menu", "/tap-list", "/non-alcoholic", "/sodas", "/soda"];

async function get(url, ms = 15000) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/json" }, redirect: "follow", signal: AbortSignal.timeout(ms) });
    if (!res.ok) return null;
    return { text: await res.text(), url: res.url };
  } catch { return null; }
}
const visible = (html) => html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ");

// Input: JSON rows of catalog root beers made by breweries (id, brand, name). Output: confirmed / not confirmed lists.
// Group catalog root beers by brewery brand.
const byBrand = new Map();
for (const r of rows) {
  const key = core(r.brand).join(" ");
  if (!key) continue;
  if (!byBrand.has(key)) byBrand.set(key, { brand: r.brand, rootBeers: [] });
  byBrand.get(key).rootBeers.push({ id: r.id, label: `${r.brand} ${r.name}`.replace(/\s+Root Beer$/, " Root Beer") });
}
const out = { confirmed: [], notConfirmed: [], notFound: [], chains: [] };
for (const [key, b] of byBrand) {
  const q = encodeURIComponent(b.brand.replace(/\b(co|company|inc|llc)\.?$/i, "").trim());
  const res = await get(`https://api.openbrewerydb.org/v1/breweries/search?query=${q}&per_page=15`, 20000);
  await sleep(400);
  let hits = [];
  try { hits = JSON.parse(res?.text ?? "[]"); } catch {}
  const want = key.split(" ");
  const matches = hits.filter((h) => { const have = new Set(core(h.name)); return want.every((w) => have.has(w)) && core(h.name).length <= want.length + 1 && h.brewery_type !== "closed" && h.brewery_type !== "planning"; });
  if (!matches.length) { out.notFound.push(b.brand); continue; }
  if (matches.length > 3) { out.chains.push(`${b.brand} (${matches.length} locations)`); continue; }
  // Website check (shared by a brewery's locations).
  const site = matches.find((m) => m.website_url)?.website_url;
  let evidence = null;
  if (site) {
    const base = site.replace(/\/+$/, "").replace(/^http:\/\//, "https://");
    for (const p of PATHS) {
      const page = await get(base + p);
      await sleep(250);
      if (!page) continue;
      const t = visible(page.text);
      const m = t.match(RB);
      if (m) { const i = m.index; evidence = { url: page.url, snippet: t.slice(Math.max(0, i - 35), i + 45).trim() }; break; }
    }
  }
  const locs = matches.map((m) => ({ obdbId: m.id, name: m.name, street: m.street ?? m.address_1, city: m.city, state: m.state_province ?? m.state, postal: m.postal_code, country: m.country, lat: m.latitude != null ? Number(m.latitude) : null, lng: m.longitude != null ? Number(m.longitude) : null, website: m.website_url }));
  if (evidence) out.confirmed.push({ brand: b.brand, rootBeers: b.rootBeers, evidence, locations: locs });
  else out.notConfirmed.push({ brand: b.brand, site: site ?? null, locations: locs.length });
  process.stdout.write(evidence ? "✓" : "·");
}
fs.writeFileSync(`${S}/brewery_research_out.json`, JSON.stringify(out, null, 1));
console.log(`\nconfirmed ${out.confirmed.length} breweries (${out.confirmed.reduce((n, c) => n + c.locations.length, 0)} locations) | not confirmed ${out.notConfirmed.length} | not in Open Brewery DB ${out.notFound.length} | chains skipped ${out.chains.length}`);
