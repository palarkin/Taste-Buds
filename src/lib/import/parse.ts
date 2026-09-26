// Pure helpers for the spreadsheet import wizard. No DB access; unit-tested in tests/import.test.ts.

export type Field = "rootBeer" | "brand" | "name" | "rating" | "notes" | "date" | "where";

export const FIELD_LABELS: Record<Field, string> = {
  rootBeer: "Root beer (brand + name in one column)",
  brand: "Brand",
  name: "Name / variety",
  rating: "Rating",
  notes: "Notes",
  date: "Date tasted",
  where: "Where you got it",
};

const SYNONYMS: Record<Field, RegExp> = {
  rootBeer: /^(root ?beers?|rb|drink|soda|beverage|product|item|title)$/,
  brand: /^(brand|brand name|maker|company|brewery|manufacturer|producer)$/,
  name: /^(name|variety|flavor|flavour|type|kind|product name)$/,
  rating: /(rating|score|stars?|grade|rank|out of|\/ ?10|points?)/,
  notes: /(notes?|comments?|thoughts|review|description|tasting notes|remarks)/,
  date: /(date|when|tasted|tried|day)/,
  where: /(where|store|shop|location|place|bought|purchased|source|retailer|found)/,
};

export type Mapping = Partial<Record<Field, number>>;

/** Guess which column holds which field from the header row. */
export function detectColumns(headers: string[]): Mapping {
  const clean = headers.map((h) => String(h ?? "").toLowerCase().trim().replace(/[_:]+/g, " ").replace(/\s+/g, " "));
  const mapping: Mapping = {};
  const used = new Set<number>();
  const order: Field[] = ["brand", "name", "rootBeer", "rating", "notes", "date", "where"];
  for (const field of order) {
    const idx = clean.findIndex((h, i) => h && !used.has(i) && SYNONYMS[field].test(h));
    if (idx >= 0) {
      mapping[field] = idx;
      used.add(idx);
    }
  }
  // "Name" alone with no brand column usually means the whole root beer name.
  if (mapping.name != null && mapping.brand == null && mapping.rootBeer == null) {
    mapping.rootBeer = mapping.name;
    delete mapping.name;
  }
  return mapping;
}

/** Index of the first row that looks like a header (2+ non-empty text cells). */
export function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = rows[i].filter((c) => c != null && String(c).trim() !== "");
    if (cells.length >= 2 && cells.every((c) => typeof c === "string")) return i;
  }
  return 0;
}

/** Extract a numeric score from messy cell values: 8, "8/10", "4 stars", "★★★★☆", "7.5 pts". */
export function parseRatingCell(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (!s) return null;
  const stars = (s.match(/[★⭐]/g) ?? []).length;
  if (stars && !/\d/.test(s)) return stars + (s.includes("½") ? 0.5 : 0);
  const frac = s.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (frac) {
    const [n, d] = [Number(frac[1]), Number(frac[2])];
    return d > 0 ? (n / d) * 10 : null;
  }
  const num = s.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return num ? Number(num[0]) : null;
}

/** True when the raw value was a fraction like "8/10" (already converted to 0–10 by parseRatingCell). */
export function isFraction(raw: unknown) {
  return typeof raw === "string" && /\d\s*\/\s*\d/.test(raw);
}

export type Scale = 5 | 10 | 100;

/** Guess the scale from the largest value seen. */
export function detectScale(values: (number | null)[]): Scale {
  const nums = values.filter((v): v is number => v != null);
  const top = nums.length ? Math.max(...nums) : 10;
  if (top > 10) return 100;
  if (top <= 5 && nums.length >= 3) return 5;
  return 10;
}

/** Convert to 0–10 and round to the nearest 0.5. Returns null when unusable. */
export function toTenPoint(value: number | null, scale: Scale): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const ten = (value / scale) * 10;
  if (ten < 0 || ten > 10.0001) return null;
  return Math.min(10, Math.round(ten * 2) / 2);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += y > 50 ? 1900 : 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 1950 || y > 2100) return null;
  return dt.toISOString().slice(0, 10);
}

/** Dates arrive as Date objects (xlsx), Excel serial numbers, "3/14/2024", "2024-03-14", or "Mar 14 2024". */
export function parseDateCell(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : iso(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
  if (typeof raw === "number") {
    if (raw < 20000 || raw > 80000) return null; // Excel serial range ≈ 1954–2119
    const dt = new Date(Math.round((raw - 25569) * 86400 * 1000));
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const s = String(raw).trim().toLowerCase();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) return iso(+m[3], +m[1], +m[2]); // US order
  m = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (m && MONTHS.includes(m[1])) return iso(+m[3], MONTHS.indexOf(m[1]) + 1, +m[2]);
  return null;
}

export type ParsedRow = {
  row: number; // 1-based spreadsheet row number, for error messages
  label: string; // the root beer as written
  brand: string;
  name: string;
  rawRating: unknown;
  rating: number | null;
  notes: string | null;
  tastedOn: string | null;
  where: string | null;
  problems: string[];
};

const text = (v: unknown) => (v == null ? "" : String(v).trim());

/** Split "Barq's Root Beer" into brand + name when there's no separate brand column. */
export function splitLabel(label: string): { brand: string; name: string } {
  const cleaned = label.replace(/\s+/g, " ").trim();
  const m = cleaned.match(/^(.*?)\s+((?:diet|zero|sugar[- ]free|vanilla|draft|draught|cream|birch|sarsaparilla|old[- ]fashioned|classic|original|craft)\b.*)$/i);
  if (m && m[1]) return { brand: m[1].replace(/\s+root\s*beer$/i, "").trim() || m[1], name: m[2] };
  return { brand: cleaned.replace(/\s+root\s*beer$/i, "").trim() || cleaned, name: "Root Beer" };
}

export function buildRows(
  data: unknown[][],
  headerRow: number,
  mapping: Mapping,
  scale: Scale,
  extraNoteColumns: number[] = [],
  headers: string[] = [],
): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (let i = headerRow + 1; i < data.length; i++) {
    const r = data[i] ?? [];
    const get = (f: Field) => (mapping[f] == null ? undefined : r[mapping[f]!]);
    let brand = text(get("brand"));
    let name = text(get("name"));
    const combined = text(get("rootBeer"));
    if (!brand && combined) ({ brand, name } = { ...splitLabel(combined), ...(name ? { name } : {}) });
    if (!name) name = "Root Beer";
    const label = combined || [brand, name !== "Root Beer" ? name : ""].filter(Boolean).join(" ");
    const rawRating = get("rating");
    const cleanRating = parseRatingCell(rawRating);
    const rating = isFraction(rawRating) ? toTenPoint(cleanRating, 10) : toTenPoint(cleanRating, scale);
    const noteParts = [text(get("notes"))];
    for (const c of extraNoteColumns) {
      const v = text(r[c]);
      if (v) noteParts.push(`${headers[c] || `Column ${c + 1}`}: ${v}`);
    }
    const notes = noteParts.filter(Boolean).join("\n") || null;
    const isBlank = !label && rawRating == null && !notes;
    if (isBlank) continue;
    const problems: string[] = [];
    if (!brand) problems.push("No root beer name");
    if (rating == null) problems.push(rawRating == null || text(rawRating) === "" ? "No rating" : `Couldn't read rating "${text(rawRating)}"`);
    out.push({
      row: i + 1,
      label: label || "(blank)",
      brand,
      name,
      rawRating,
      rating,
      notes,
      tastedOn: parseDateCell(get("date")),
      where: text(get("where")) || null,
      problems,
    });
  }
  return out;
}

/** Group key for "same root beer written the same way" within one file. */
export function labelKey(brand: string, name: string) {
  return `${brand} ${name}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
