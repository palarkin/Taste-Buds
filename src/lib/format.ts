export function formatRating(r: number | null | undefined): string {
  if (r == null) return "–";
  return Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1);
}

export function formatPrice(cents: number | null | undefined): string {
  if (cents == null) return "–";
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(`${d.slice(0, 10)}T12:00:00`) : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Warm-to-cool colour for a 0–10 rating. */
export function ratingColor(r: number): string {
  if (r >= 8.5) return "bg-emerald-700 text-white";
  if (r >= 7) return "bg-lime-700 text-white";
  if (r >= 5) return "bg-amber-500 text-stone-900";
  if (r >= 3) return "bg-orange-700 text-white";
  return "bg-red-700 text-white";
}

export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type Freshness = "fresh" | "recent" | "stale" | "unknown";

/** How trustworthy a "they carry it" report is, based on the pickup/sighting date. */
export function freshness(date: string | null | undefined): { tone: Freshness; label: string; days: number | null } {
  if (!date) return { tone: "unknown", label: "Pickup date unknown", days: null };
  const then = new Date(`${date.slice(0, 10)}T12:00:00`).getTime();
  const days = Math.max(0, Math.round((Date.now() - then) / 86400000));
  const ago =
    days === 0 ? "today" : days === 1 ? "yesterday" : days < 30 ? `${days} days ago` : days < 365 ? `${Math.round(days / 30)} mo ago` : `${(days / 365).toFixed(days < 730 ? 1 : 0)} yr ago`;
  const tone: Freshness = days <= 30 ? "fresh" : days <= 180 ? "recent" : "stale";
  return { tone, label: `Picked up ${ago}`, days };
}

export const FRESHNESS_DOT: Record<Freshness, string> = {
  fresh: "bg-emerald-500",
  recent: "bg-amber-400",
  stale: "bg-stone-400",
  unknown: "bg-stone-300",
};
