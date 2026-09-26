import { describe, expect, it } from "vitest";
import { freshness } from "@/lib/format";

const daysAgo = (n: number) => {
  const d = new Date(Date.now() - n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

describe("freshness", () => {
  it("treats a missing pickup date as unknown, never as recent", () => {
    expect(freshness(null)).toMatchObject({ tone: "unknown", label: "Pickup date unknown", days: null });
  });
  it("grades by age", () => {
    expect(freshness(daysAgo(0))).toMatchObject({ tone: "fresh", label: "Picked up today" });
    expect(freshness(daysAgo(1)).label).toBe("Picked up yesterday");
    expect(freshness(daysAgo(20))).toMatchObject({ tone: "fresh", label: "Picked up 20 days ago" });
    expect(freshness(daysAgo(90)).tone).toBe("recent");
    expect(freshness(daysAgo(3 * 365)).tone).toBe("stale");
    expect(freshness(daysAgo(3 * 365)).label).toBe("Picked up 3 yr ago");
  });
});
