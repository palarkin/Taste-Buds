import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { searchCatalog } from "@/lib/queries";
import { displayName, searchKey } from "@/lib/normalize";
import { upsertCatalogEntry } from "./index";
import { fromRootBeerBarrel } from "./parse";
import { productMatches } from "./retail-parse";

// Other public root beer lists (names only, each entry links back to its source).
// Everything goes through a preview first: only names with nothing similar in the catalog are offered,
// and the server re-checks each one at the moment it's added.

export type ListSource = "rootbeerrespect" | "rootbeerrating" | "mikebuffington";

export const LIST_SOURCES: Record<ListSource, { label: string; home: string }> = {
  rootbeerrespect: { label: "Root Beer Respect", home: "https://rootbeerrespect.wordpress.com/alphabetical-list/" },
  rootbeerrating: { label: "Root Beer Rating", home: "https://rootbeerrating.com/" },
  mikebuffington: { label: "Mike Buffington's Root Beer List", home: "https://www.mikebuffington.net/rootbeer/" },
};

export type ListItem = { source: ListSource; title: string; url: string };

export type Classified = ListItem & {
  status: "existing" | "similar" | "new";
  brand: string;
  name: string;
  match?: string; // the catalog entry it matched or resembles
};

const UA = "Mozilla/5.0 (TasteBuds private root beer club; name list only)";
const TYPE_RE = /\b(root ?beer|birch ?beer|sarsaparilla|sasparilla|spruce ?beer)\b/i;

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

async function getText(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return res.text();
}

/** WordPress.com blog posts (titles + links) in the given categories. */
async function wordpressTitles(site: string, categories?: number[]): Promise<{ title: string; url: string }[]> {
  const out: { title: string; url: string }[] = [];
  for (let page = 1; page <= 10; page++) {
    const cat = categories ? `&categories=${categories.join(",")}` : "";
    const res = await fetch(`https://public-api.wordpress.com/wp/v2/sites/${site}/posts?per_page=100&page=${page}${cat}&_fields=title,link`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 400) break; // past the last page
    if (!res.ok) throw new Error(`${site} returned ${res.status}`);
    const posts = (await res.json()) as { title: { rendered: string }; link: string }[];
    if (!posts.length) break;
    out.push(...posts.map((p) => ({ title: decode(p.title.rendered), url: p.link })));
    if (Number(res.headers.get("x-wp-totalpages") ?? page) <= page) break;
  }
  return out;
}

/** Mike Buffington's page: a numbered list ("166  Hand Crafted Old Fashioned Special Reserve Root Beer"). */
function parseNumberedList(html: string): string[] {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, "|")
    .replace(/\s+/g, " ");
  const names = new Set<string>();
  for (const m of text.matchAll(/\|\s*(\d{1,3})\s*\|[\s|]*([^|]{3,90}?)\s*\|/g)) {
    const name = decode(m[2]);
    if (TYPE_RE.test(name)) names.add(name);
  }
  return [...names];
}

export async function fetchListItems(): Promise<{ items: ListItem[]; failed: string[] }> {
  const items: ListItem[] = [];
  const failed: string[] = [];
  // Root Beer Respect: review posts only (category 309), not news.
  try {
    for (const p of await wordpressTitles("rootbeerrespect.wordpress.com", [309])) {
      if (TYPE_RE.test(p.title) && !/^news\b/i.test(p.title)) items.push({ source: "rootbeerrespect", ...p });
    }
  } catch (e) {
    failed.push(`Root Beer Respect (${(e as Error).message})`);
  }
  try {
    for (const p of await wordpressTitles("rootbeerrating.com")) {
      if (TYPE_RE.test(p.title)) items.push({ source: "rootbeerrating", ...p });
    }
  } catch (e) {
    failed.push(`Root Beer Rating (${(e as Error).message})`);
  }
  try {
    const html = await getText(LIST_SOURCES.mikebuffington.home);
    for (const title of parseNumberedList(html)) items.push({ source: "mikebuffington", title, url: LIST_SOURCES.mikebuffington.home });
  } catch (e) {
    failed.push(`Mike Buffington (${(e as Error).message})`);
  }
  return { items, failed };
}

function candidate(title: string) {
  const t = title.replace(/\s*\((?:review|updated?)\)\s*$/i, "");
  const category = /birch/i.test(t) ? "birch" : /sars|saspar/i.test(t) ? "sarsaparilla" : "root";
  const diet = /\b(diet|zero|sugar[- ]free)\b/i.test(t);
  return fromRootBeerBarrel(t, category, diet);
}

/** Is this name already in the catalog, similar to something in it, or genuinely new? */
export async function classifyItem(item: ListItem): Promise<Classified> {
  const c = candidate(item.title);
  if (!c) return { ...item, status: "similar", brand: "", name: "", match: "(couldn't read the name)" };
  const base = { ...item, brand: c.brand, name: c.name };

  const [exact] = await db
    .select({ brand: schema.rootBeers.brand, name: schema.rootBeers.name })
    .from(schema.rootBeers)
    .where(eq(schema.rootBeers.searchKey, searchKey(c.brand, c.name)));
  if (exact) return { ...base, status: "existing", match: displayName(exact) };

  const hits = await searchCatalog(item.title, 8);
  const strict = hits.find((h) => productMatches({ title: item.title }, h) || productMatches({ title: `${h.brand} ${h.name}` }, c));
  if (strict) return { ...base, status: "existing", match: displayName(strict) };
  // Anything reasonably close is treated as a possible duplicate and left for a person to decide.
  if (hits[0] && hits[0].score >= 0.45) return { ...base, status: "similar", match: displayName(hits[0]) };
  return { ...base, status: "new" };
}

export async function previewLists() {
  const { items, failed } = await fetchListItems();
  const seen = new Set<string>();
  const classified: Classified[] = [];
  for (const item of items) {
    const c = candidate(item.title);
    const key = c ? searchKey(c.brand, c.name) : item.title.toLowerCase();
    if (seen.has(key)) continue; // the same root beer listed by more than one source
    seen.add(key);
    classified.push(await classifyItem(item));
  }
  return { classified, failed, sources: items.length };
}

/** Adds the chosen items, re-checking each one first so nothing already in the catalog is duplicated. */
export async function addListItems(items: ListItem[], userId: string) {
  let added = 0;
  const skipped: string[] = [];
  for (const item of items) {
    const c = await classifyItem(item);
    if (c.status !== "new") {
      skipped.push(`${item.title} (${c.status === "existing" ? "already in catalog" : `looks like ${c.match}`})`);
      continue;
    }
    const r = await upsertCatalogEntry(
      { brand: c.brand, name: c.name, style: candidate(item.title)?.style ?? null, sweetener: null, sourceUrl: item.url },
      item.source,
      userId,
    );
    if (r.status === "created") added++;
    else skipped.push(`${item.title} (already in catalog)`);
  }
  return { added, skipped };
}
