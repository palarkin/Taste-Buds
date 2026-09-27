// Nationwide scan: which US breweries (Open Brewery DB) say on their own website that they have root beer?
// Resumable — results append to <outDir>/scan.jsonl and finished breweries are skipped on restart.
// Usage: node scripts/scan-breweries.mjs <outDir> [concurrency]
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2];
const CONCURRENCY = Number(process.argv[3] ?? 10);
if (!outDir) throw new Error("usage: node scripts/scan-breweries.mjs <outDir> [concurrency]");
fs.mkdirSync(outDir, { recursive: true });
const listFile = path.join(outDir, "breweries.json");
const resultsFile = path.join(outDir, "scan.jsonl");
const UA = "Mozilla/5.0 (Macintosh) TasteBuds/0.1 (private root beer club; checking whether breweries list root beer)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. The brewery list (cached after the first run).
let breweries;
if (fs.existsSync(listFile)) breweries = JSON.parse(fs.readFileSync(listFile, "utf8"));
else {
  breweries = [];
  for (let page = 1; page <= 100; page++) {
    const res = await fetch(`https://api.openbrewerydb.org/v1/breweries?by_country=united_states&per_page=200&page=${page}`, { headers: { "User-Agent": UA } });
    const batch = await res.json();
    if (!batch.length) break;
    breweries.push(...batch);
    await sleep(500);
  }
  fs.writeFileSync(listFile, JSON.stringify(breweries));
}
const todo0 = breweries.filter((b) => b.website_url && !["closed", "planning"].includes(b.brewery_type));
const done = new Set(fs.existsSync(resultsFile) ? fs.readFileSync(resultsFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).id) : []);
const todo = todo0.filter((b) => !done.has(b.id));
console.log(`${breweries.length} US breweries · ${todo0.length} with websites · ${done.size} already scanned · ${todo.length} to go`);

// 2. Fetch + classify.
async function get(url, ms = 15000) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(ms) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.includes("html")) return null;
    const text = await res.text();
    return { html: text.slice(0, 1_500_000), url: res.url };
  } catch {
    return null;
  }
}
const visible = (html) =>
  html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/\s+/g, " ");

const RB = /\b(root ?beer|birch ?beer|sarsaparilla|sasparilla)\b/gi;
const BOOZE = /\b(stout|porter|ale|lager|ipa|pilsner|sour|saison|barleywine|abv|\d+(\.\d+)?\s?%|hard root beer|alcoholic root beer|spiked|boozy|brewed with|beer style|imperial|barrel[- ]aged|nitro stout|candy|candies|barrels? candy)\b/i;
const SODA = /\b(soda|sodas|house[- ]?made|homemade|home[- ]brewed root beer|craft soda|non[- ]?alcoholic|n\/?a\b|non[- ]?alc|kids?|children|root beer float|floats?|on tap|draft root beer|fountain|our own root beer|made in[- ]house|in[- ]house)\b/i;

function classify(text) {
  const hits = [];
  for (const m of text.matchAll(RB)) {
    const ctx = text.slice(Math.max(0, m.index - 70), m.index + m[0].length + 70);
    if (BOOZE.test(ctx) && !/root beer float/i.test(ctx)) hits.push({ kind: "unclear", ctx });
    else hits.push({ kind: SODA.test(ctx) ? "soda" : "plain", ctx });
  }
  return hits;
}

function candidateLinks(html, base) {
  const links = new Set();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const [, href, label] = m;
    if (!/(menu|beer|tap|drink|food|soda|non-?alc|kid|brew)/i.test(href + " " + label)) continue;
    try {
      const u = new URL(href, base);
      if (u.host === new URL(base).host && !/\.(pdf|jpg|png|gif)$/i.test(u.pathname)) links.add(u.href.split("#")[0]);
    } catch {}
    if (links.size >= 4) break;
  }
  return [...links];
}

async function scan(b) {
  const base = b.website_url.replace(/^http:\/\//, "https://");
  const pages = [];
  const home = (await get(base)) ?? (await get(b.website_url));
  if (!home) return { id: b.id, status: "unreachable" };
  pages.push(home);
  let links = candidateLinks(home.html, home.url);
  if (!links.length) links = ["/menu", "/beers"].map((p) => new URL(p, home.url).href);
  for (const l of links) {
    const p = await get(l);
    if (p) pages.push(p);
    await sleep(300);
  }
  let best = null;
  for (const p of pages) {
    for (const h of classify(visible(p.html))) {
      const rank = { soda: 3, plain: 2, unclear: 1 }[h.kind];
      if (!best || rank > best.rank) best = { rank, kind: h.kind, url: p.url, snippet: h.ctx.trim().slice(0, 170) };
    }
  }
  if (!best) return { id: b.id, status: "none", pages: pages.length };
  return { id: b.id, status: best.kind === "unclear" ? "unclear" : "confirmed", kind: best.kind, url: best.url, snippet: best.snippet, pages: pages.length };
}

// 3. Worker pool.
let i = 0, finished = 0, confirmed = 0;
const started = Date.now();
async function worker() {
  while (i < todo.length) {
    const b = todo[i++];
    const r = await scan(b);
    fs.appendFileSync(resultsFile, JSON.stringify({ ...r, name: b.name, city: b.city, state: b.state_province ?? b.state }) + "\n");
    finished++;
    if (r.status === "confirmed") confirmed++;
    if (finished % 100 === 0) {
      const rate = finished / ((Date.now() - started) / 60000);
      console.log(`${finished}/${todo.length} scanned · ${confirmed} confirmed · ~${Math.round((todo.length - finished) / rate)} min left`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`done: ${finished} scanned, ${confirmed} confirmed`);
