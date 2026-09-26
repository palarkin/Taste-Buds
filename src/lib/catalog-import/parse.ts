// Pure helpers for turning outside catalog data into Taste Buds entries. Unit-tested in tests/catalog-import.test.ts.

export type CatalogCandidate = {
  brand: string;
  name: string;
  style: string | null;
  sweetener: string | null;
};

const TYPE_RE = /\b(root ?beer|birch ?beer|sarsaparilla|sasparilla|spruce ?beer)\b/i;
const DIET_RE = /\b(diet|zero|sugar[- ]free|no sugar|0 sugar|light|lite)\b/i;

/** Title-case strings that arrive in ALL CAPS ("ROOT BEER" -> "Root Beer"), keep everything else as written. */
export function tidyCase(s: string): string {
  const t = s.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
  const allCaps = t === t.toUpperCase() && /[A-Z]/.test(t);
  const allLower = t === t.toLowerCase() && /[a-z]/.test(t);
  if (t.length > 3 && (allCaps || allLower)) {
    return t.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_, pre, c) => pre + c.toUpperCase()).replace(/\bA&w\b/i, "A&W");
  }
  return t;
}

/** Best guess at the sweetener from an ingredient list. */
export function detectSweetener(ingredients: string | null | undefined): string | null {
  if (!ingredients) return null;
  const s = ingredients.toLowerCase();
  if (/high[- ]fructose|hfcs|glucose[- ]fructose|corn syrup/.test(s)) return "HFCS";
  if (/cane sugar|sucre de canne|pure cane/.test(s)) return "Cane sugar";
  if (/\bhoney\b/.test(s)) return "Honey";
  if (/stevia|monk ?fruit|erythritol|allulose/.test(s)) return "Stevia / natural zero-cal";
  if (/sucralose|aspartame|acesulfame|saccharin/.test(s)) return "Artificial sweetener";
  if (/\bsugar\b|\bsucrose\b/.test(s)) return "Sugar";
  return null;
}

function styleFor(text: string): string | null {
  if (DIET_RE.test(text)) return "Diet";
  if (/birch/i.test(text)) return "Birch beer";
  if (/sars|saspar/i.test(text)) return "Sarsaparilla";
  if (/spruce/i.test(text)) return "Spruce beer";
  return null;
}

const DRINK_CATEGORY = /en:(beverages|sodas|carbonated-drinks|soft-drinks|root-beers|sweetened-beverages|artificially-sweetened-beverages|drinks)/;
const NOT_DRINK = /candy|candies|barrel|lollipop|ice cream|float bar|popsicle|freezer pop|gum\b|jelly|taffy|concentrate|extract|flavou?ring|cake|cookie|pudding|tablet/i;
const OTHER_FLAVOR = /\b(energy|ginger ale|cola|orange|lemon|lime|grape|cream soda|dr\.? ?pepper|tonic|seltzer|sparkling water|iced tea|coffee|lemonade|punch|kombucha)\b/i;
const CORPORATE = /[,\s]+(inc\.?|incorporated|llc|l\.l\.c\.|ltd\.?|limited|corp\.?|corporation|div\.?)$/i;
const JUNK_TOKEN = /^(soda|sodas|soft drink|drink|beverage|pop|root ?beer|root beer soda|caffeine free soda|caff?ine free)$/i;

/** Open Food Facts product -> catalog candidate, or null when it isn't a root beer style drink we can name. */
export function fromOpenFoodFacts(p: {
  brands?: string | string[] | null;
  product_name?: string | null;
  categories_tags?: string[] | null;
  ingredients_text?: string | null;
  ingredients_tags?: string[] | null;
}): CatalogCandidate | null {
  const rawName = tidyCase(p.product_name ?? "");
  const cats = (p.categories_tags ?? []).join(" ");
  if (!rawName) return null;
  const typeInName = TYPE_RE.test(rawName);
  if (!typeInName && !/en:root-beers|en:sarsaparillas|en:birch-beers/.test(cats)) return null;
  if (NOT_DRINK.test(rawName) || !DRINK_CATEGORY.test(cats)) return null;
  if (!typeInName && OTHER_FLAVOR.test(rawName)) return null; // mis-tagged: "Energy Drink" filed under root beers

  // Brand: first entry of the brand list, without corporate suffixes.
  const brandList = (Array.isArray(p.brands) ? p.brands.join(",") : (p.brands ?? "")).split(",").map((b) => b.trim()).filter(Boolean);
  let brand = tidyCase(brandList[0] ?? "").replace(CORPORATE, "").trim();
  // Product names are often comma lists ("Day's, Old Fashioned, soda"): keep the meaningful parts.
  const nameParts = rawName.split(",").map((x) => x.trim()).filter((x) => x && !JUNK_TOKEN.test(x));
  let name = nameParts.join(" ");
  if (!brand) {
    const m = name.match(new RegExp(`^(.+?)\\s+${TYPE_RE.source}`, "i"));
    if (!m || m[1].length < 2) return null;
    brand = m[1];
  }
  brand = brand.replace(/\s+root ?beer( company)?$/i, "").trim() || brand;
  if (!/[a-z0-9]/i.test(brand)) return null; // junk like "/"
  const lead = brand.match(/^(diet|zero sugar|zero)\s+(.+)$/i); // "Diet Barq's" -> Barq's + Diet
  if (lead) {
    brand = lead[2];
    name = `${lead[1]} ${name}`;
  }

  if (name.toLowerCase().startsWith(brand.toLowerCase())) name = name.slice(brand.length);
  name = name
    .replace(new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "")
    .replace(/\broot ?beer\b/gi, "")
    .replace(/\bsoda\b/gi, "")
    .replace(/^[^a-z0-9]+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || /^(drink|beverage|pop)$/i.test(name)) name = "Root Beer";
  if (/^birch$/i.test(name)) name = "Birch Beer";
  name = tidyCase(name);

  const ingredients = p.ingredients_text || (p.ingredients_tags ?? []).join(" ").replace(/en:|fr:|-/g, " ");
  return { brand, name, style: styleFor(rawName), sweetener: detectSweetener(ingredients) };
}

const SUFFIX_WORDS = /^(co\.?|company|brewing|brewery|brewhouse|breweries|beverages?|bottling|works|soda|sodas|pop|foods|inc\.?|ltd\.?|llc|distributing|drinks|pub)$/i;

/** Split "Maker Words Product Words" at the last company-style word that still leaves a drink type in the product. */
function splitMaker(t: string): { brand: string; name: string } | null {
  const words = t.split(" ");
  let cut = -1;
  for (let i = 0; i < words.length - 1 && i < 8; i++) {
    if (SUFFIX_WORDS.test(words[i]) && TYPE_RE.test(words.slice(i + 1).join(" "))) cut = i;
  }
  if (cut < 0) return null;
  return { brand: words.slice(0, cut + 1).join(" "), name: words.slice(cut + 1).join(" ") };
}

const VARIETY_WORDS = new Set(
  "diet sugar free zero no low lite light cane natural draft draught old fashioned original classic premium craft vanilla butterscotch maple honey cream creamy spiced spicy caffeine free brown barrel extra dry sparkling organic real pure gourmet sarsaparilla birch white red black".split(" "),
);

/** Move trailing flavour/variety words off the brand: "Dog n Suds Sugar Free" + "Root Beer" -> "Dog n Suds" + "Sugar Free Root Beer". */
export function peelVariety(brand: string, name: string): { brand: string; name: string } {
  const words = brand.split(" ");
  let cut = words.length;
  while (cut > 1 && VARIETY_WORDS.has(words[cut - 1].toLowerCase().replace(/[^a-z]/g, ""))) cut--;
  if (cut === words.length) return { brand, name };
  return { brand: words.slice(0, cut).join(" "), name: `${words.slice(cut).join(" ")} ${name}`.trim() };
}

/** Anthony's review titles are "Maker Product" ("Pirate Pete's Soda Pop Co Jolly Roger Root Beer"). */
export function fromRootBeerBarrel(title: string, category: "root" | "birch" | "sarsaparilla" | "other", diet: boolean): CatalogCandidate | null {
  const t = title.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
  if (!t || t.length > 120) return null;
  // Anthony's "other reviews" also covers energy drinks, colas etc. Keep only root beer relatives.
  if (category === "other" && !TYPE_RE.test(t)) return null;
  let brand: string;
  let name: string;
  const split = splitMaker(t);
  if (split) {
    ({ brand, name } = split);
  } else {
    const typeAt = t.search(TYPE_RE);
    brand = typeAt > 0 ? t.slice(0, typeAt).trim() : t;
    name = typeAt > 0 ? t.slice(typeAt).trim() : category === "birch" ? "Birch Beer" : category === "sarsaparilla" ? "Sarsaparilla" : "Root Beer";
  }
  name = name.replace(/^root ?beer$/i, "Root Beer");
  ({ brand, name } = peelVariety(brand, name));
  if (!brand) return null;
  const style = diet
    ? "Diet"
    : category === "birch"
      ? "Birch beer"
      : category === "sarsaparilla"
        ? "Sarsaparilla"
        : category === "other"
          ? styleFor(t) ?? "Other"
          : styleFor(t);
  return { brand, name, style, sweetener: null };
}

/** UPC/EAN codes: digits only, 8–14 long. Normalizes UPC-A (12) and EAN-13 with a leading 0 to the same key. */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return null;
  return digits.length === 13 && digits.startsWith("0") ? digits.slice(1) : digits;
}
