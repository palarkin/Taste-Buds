// Shared by catalog search, duplicate detection and spreadsheet import.

const FILLER = /\b(root\s*beer|rootbeer|soda|pop|craft|old\s*fashioned|the)\b/g;

/** "A & W Root Beer!" -> "a and w" */
export function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(FILLER, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function searchKey(brand: string, name?: string | null): string {
  const key = normalizeName(`${brand} ${name ?? ""}`);
  return key || normalizeName(brand) || brand.toLowerCase();
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function displayName(rb: { brand: string; name: string }): string {
  return rb.name && rb.name.toLowerCase() !== "root beer" ? `${rb.brand} ${rb.name}` : rb.brand;
}
