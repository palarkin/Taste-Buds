import { XMLParser } from "fast-xml-parser";

// Parses a Google My Maps KML export into plain pins. Pure; unit-tested in tests/kml.test.ts.

export type KmlPin = { name: string; notes: string | null; lat: number; lng: number; region: string | null };

type Node = Record<string, unknown>;
const asArray = <T,>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as Node)) return String((v as Node)["#text"]);
  return "";
}

export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export function parseKml(xml: string): { title: string | null; pins: KmlPin[] } {
  const parser = new XMLParser({ ignoreAttributes: true, cdataPropName: false, trimValues: true, parseTagValue: false });
  const doc = (parser.parse(xml) as Node).kml as Node | undefined;
  const root = (doc?.Document ?? doc) as Node | undefined;
  if (!root) return { title: null, pins: [] };
  const pins: KmlPin[] = [];

  const walk = (node: Node, region: string | null) => {
    for (const pm of asArray(node.Placemark as Node | Node[])) {
      const point = pm.Point as Node | undefined;
      const coords = text(point?.coordinates).split(/\s+/)[0];
      const [lng, lat] = coords.split(",").map(Number);
      const name = htmlToText(text(pm.name));
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      pins.push({ name: name.slice(0, 160), notes: htmlToText(text(pm.description)).slice(0, 1000) || null, lat, lng, region });
    }
    for (const f of asArray(node.Folder as Node | Node[])) walk(f, htmlToText(text(f.name)) || region);
  };
  walk(root, null);
  return { title: htmlToText(text(root.name)) || null, pins };
}

/** Guess a place type from its name, for the pin sheet and filters. */
export function guessCategory(name: string): string | null {
  const n = name.toLowerCase();
  if (/root ?beer|drive[- ]?in|a&w\b/.test(n)) return "Root beer stand";
  if (/distill|cider|meadery|winery|tap ?room|fermented/.test(n)) return "Brewery / pub";
  if (/brew(ing|ery|eries|house|pub|works)?\b|taphouse|tap house|taproom|beer co|ale ?house|pub\b|tavern/.test(n)) return "Brewery / pub";
  if (/soda|rocket fizz|pop shop|candy|sweets|lolli|confection|fizz/.test(n)) return "Soda / candy shop";
  if (/market|grocery|grocer|food(s| store| center)|supermarket|co-?op|hy-?vee|kroger|meijer|sprouts|whole foods|busch's|piggly|iga\b/.test(n)) return "Grocery";
  if (/liquor|wine|spirits|bevmo|beverage|bottle shop|package store/.test(n)) return "Liquor / beverage store";
  if (/stand\b|diner|grill|bbq|barbecue|restaurant|cafe|café|pizza|burger|deli|kitchen|eatery|steak/.test(n)) return "Restaurant";
  if (/farm|orchard|mercantile|general store|country store|trading post|ranch|hardware|gift/.test(n)) return "Store";
  return null;
}

/** Stable id for a pin (My Maps has none), so re-imports don't duplicate it. */
export function pinId(p: { name: string; lat: number; lng: number }): string {
  return `rbmap:${p.lat.toFixed(5)},${p.lng.toFixed(5)}:${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`;
}
