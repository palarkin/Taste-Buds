import { normalizeName } from "@/lib/normalize";

// Pure helpers for matching retailer products to catalog root beers. Unit-tested in tests/retail.test.ts.

export const DRINK_TITLE = /\b(root ?beer|birch ?beer|sarsaparilla|sasparilla)\b/i;
const NOT_A_DRINK = /\b(syrup|extract|concentrate|candy|candies|gum|taffy|lollipop|jelly|mix|kit|glass(?:es)? set|mug|shirt|sticker|magnet|ornament|popsicle|float bar|ice cream|flavou?ring|tablet|drops?|subscription|sampler|variety|assorted|gift|club|box|bundle)\b/i;

/** Words that describe packaging or size, not the root beer itself. */
const NOISE = new Set(
  ("oz fl floz ml l liter litre bottle bottles btl glass can cans pack pk pks count ct case of single singles each swing swingtop top lid cap plastic x and with a an set bundle variety pint quart growler new edition limited cane sugar made " +
    // marketing words that don't change which root beer it is
    "original the flavored flavor lto handcrafted hand crafted gourmet premium famous authentic brand genuine real all natural").split(" "),
);
const isNoise = (w: string) => NOISE.has(w) || /^\d+(\.\d+)?(oz|ml|l|pk|ct|pack)?$/.test(w);

export function isRootBeerProduct(title: string): boolean {
  return DRINK_TITLE.test(title) && !NOT_A_DRINK.test(title);
}

/** "12 Bottles" → 12, "Iron Horse Root Beer - 24-Pack" → 24, "Case of 24" → 24, "Default Title" → 1. */
export function packSize(...texts: (string | null | undefined)[]): number {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  const m =
    t.match(/case of (\d{1,3})/) ||
    t.match(/(\d{1,3})\s*[- ]?\s*(?:pack|pk|ct|count|bottles|cans)\b/) ||
    t.match(/\b(\d{1,3})\s*x\s*\d/) ||
    t.match(/pack of (\d{1,3})/);
  const n = m ? Number(m[1]) : 1;
  return n >= 1 && n <= 96 ? n : 1;
}

/** Meaningful words of a product title for matching: normalized, minus sizes/packaging. */
export function productWords(title: string): string[] {
  return normalizeName(title.replace(/[-–|,/()]/g, " ")).split(" ").filter((w) => w && !isNoise(w));
}

/**
 * Does this catalog entry describe exactly this product?
 * - every word of the catalog brand + name must be in the product title (or vendor), and
 * - the product must not have leftover flavour words the catalog entry lacks
 *   ("Sprecher Smoky Maple Root Beer" must not match plain "Sprecher").
 */
export function productMatches(product: { title: string; vendor?: string | null }, entry: { brand: string; name: string }): boolean {
  const title = productWords(product.title);
  const vendor = product.vendor ? productWords(product.vendor) : [];
  const have = new Set([...title, ...vendor]);
  const entryWords = normalizeName(`${entry.brand} ${entry.name}`).split(" ").filter((w) => w && !isNoise(w));
  if (!entryWords.length) return false;
  // Company words may be missing from a product title ("Maine Root" vs "Maine Root Beverage Co").
  const COMPANY = new Set(["co", "company", "brewing", "brewery", "beverage", "beverages", "bottling", "soda", "works", "inc", "llc", "and"]);
  if (!entryWords.every((w) => have.has(w) || COMPANY.has(w))) return false;
  const entrySet = new Set(entryWords);
  const leftovers = title.filter((w) => !entrySet.has(w) && !COMPANY.has(w));
  return leftovers.length === 0;
}

/** "Dang! Root Beer Soda 12-Pack" -> "Dang! Root Beer"; strips pack counts, sizes and packaging for naming new entries. */
export function cleanProductTitle(title: string): string {
  return title
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s*[-–|,]\s*/g, " ")
    .replace(/\b\d+(\.\d+)?\s*(fl\.?\s*)?oz\b\.?/gi, " ")
    .replace(/\b(case of \d+|\d+\s*-?\s*(pack|pk|ct|count|bottles?|cans?))\b/gi, " ")
    .replace(/\b(glass|plastic)\s+bottles?\b|\bswing\s*(lid|top)\b|\bsoda\b(?=\s*$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Words that make a different product of the same brand. A photo is only used when the product it
// came from has exactly the same set as the catalog entry: "A&W Diet" and "A&W Zero Sugar" never share a photo.
const VARIANTS: [string, RegExp][] = [
  ["diet", /\bdiet\b/],
  ["zero", /\bzero\b|\b0 ?(sugar|cal)/],
  ["sugar-free", /\bsugar[- ]?free\b|\bno sugar\b/],
  ["light", /\b(lite|light)\b/],
  ["low-cal", /\blow[- ]?cal\b|\blocal\b/],
  ["caffeine-free", /\bcaffeine[- ]?free\b/],
  ["caffeinated", /\bcaffeinated\b|\brev'?d up\b/],
  ["vanilla", /\bvanilla\b/],
  ["cream", /\bcream(y)?\b|\bcreme\b/],
  ["maple", /\bmaple\b/],
  ["honey", /\bhoney\b/],
  ["cherry", /\bcherry\b/],
  ["butterscotch", /\bbutterscotch\b/],
  ["caramel", /\bcaramel\b/],
  ["marshmallow", /\bmarshmallow\b/],
  ["pumpkin", /\bpumpkin\b/],
  ["spiced", /\bspiced?\b|\bspicy\b/],
  ["smoky", /\bsmok(y|ed)\b/],
  ["espresso", /\bespresso\b|\bcoffee\b/],
  ["draft", /\bdraft\b|\bdraught\b/],
  ["float", /\bfloat\b/],
  ["birch", /\bbirch\b/],
  ["sarsaparilla", /\bsarsaparilla\b|\bsasparilla\b/],
  ["white", /\bwhite\b/],
  ["red", /\bred\b/],
  ["black", /\bblack\b/],
  ["prebiotic", /\bprebiotic\b|\bprobiotic\b/],
];

export function variantSet(text: string): string[] {
  const t = text.toLowerCase().replace(/[’']/g, "'");
  return VARIANTS.filter(([, re]) => re.test(t)).map(([k]) => k).sort();
}

/**
 * Is a photo of this source product safe to show on this catalog entry?
 * The product must match the entry (productMatches) AND carry exactly the same variant words.
 */
export function photoMatches(source: { title: string; brand?: string | null }, entry: { brand: string; name: string }): boolean {
  const sourceText = `${source.brand ?? ""} ${source.title}`;
  const entryText = `${entry.brand} ${entry.name}`;
  if (variantSet(sourceText).join() !== variantSet(entryText).join()) return false;
  return productMatches({ title: source.title, vendor: source.brand ?? null }, entry);
}
