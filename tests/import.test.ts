import { describe, expect, it } from "vitest";
import {
  buildRows,
  detectColumns,
  detectScale,
  findHeaderRow,
  parseDateCell,
  parseRatingCell,
  splitLabel,
  toTenPoint,
} from "@/lib/import/parse";
import { normalizeName, searchKey } from "@/lib/normalize";

describe("detectColumns", () => {
  it("maps common header names", () => {
    expect(detectColumns(["Brand", "Flavor", "Score (1-10)", "Notes", "Date Tried", "Where bought"])).toEqual({
      brand: 0, name: 1, rating: 2, notes: 3, date: 4, where: 5,
    });
  });
  it("treats a lone Name column as the full root beer", () => {
    expect(detectColumns(["Name", "Rating"])).toEqual({ rootBeer: 0, rating: 1 });
  });
  it("handles a 'Root Beer' column", () => {
    expect(detectColumns(["Root Beer", "Stars", "Comments"])).toEqual({ rootBeer: 0, rating: 1, notes: 2 });
  });
});

describe("findHeaderRow", () => {
  it("skips title rows", () => {
    expect(findHeaderRow([["My Root Beers"], [], ["Brand", "Rating"], ["A&W", 7]])).toBe(2);
  });
});

describe("ratings", () => {
  it("parses messy values", () => {
    expect(parseRatingCell(8)).toBe(8);
    expect(parseRatingCell("8/10")).toBe(8);
    expect(parseRatingCell("4/5")).toBe(8);
    expect(parseRatingCell("4 stars")).toBe(4);
    expect(parseRatingCell("★★★½")).toBe(3.5);
    expect(parseRatingCell("7,5")).toBe(7.5);
    expect(parseRatingCell("")).toBeNull();
    expect(parseRatingCell("meh")).toBeNull();
  });
  it("detects scale", () => {
    expect(detectScale([3, 4, 5, 2])).toBe(5);
    expect(detectScale([7, 9, 6])).toBe(10);
    expect(detectScale([85, 90])).toBe(100);
    expect(detectScale([4, 5])).toBe(10); // too few values to assume 5-point
  });
  it("converts to 0–10 in half steps", () => {
    expect(toTenPoint(4, 5)).toBe(8);
    expect(toTenPoint(3.3, 5)).toBe(6.5);
    expect(toTenPoint(87, 100)).toBe(8.5);
    expect(toTenPoint(7.26, 10)).toBe(7.5);
    expect(toTenPoint(11, 10)).toBeNull();
  });
});

describe("parseDateCell", () => {
  it("handles common formats", () => {
    expect(parseDateCell("2024-03-14")).toBe("2024-03-14");
    expect(parseDateCell("3/14/2024")).toBe("2024-03-14");
    expect(parseDateCell("3/14/24")).toBe("2024-03-14");
    expect(parseDateCell("March 14, 2024")).toBe("2024-03-14");
    expect(parseDateCell(45365)).toBe("2024-03-14"); // Excel serial
    expect(parseDateCell("sometime")).toBeNull();
    expect(parseDateCell("2/30/2024")).toBeNull();
  });
});

describe("names", () => {
  it("normalizes brand spellings to the same key", () => {
    expect(normalizeName("A&W Root Beer")).toBe(normalizeName("A & W"));
    expect(normalizeName("Barq’s")).toBe("barqs");
    expect(searchKey("IBC", "Root Beer")).toBe("ibc");
    expect(searchKey("A&W", "Diet")).toBe("a and w diet");
  });
  it("splits combined labels", () => {
    expect(splitLabel("Barq's Root Beer")).toEqual({ brand: "Barq's", name: "Root Beer" });
    expect(splitLabel("A&W Diet")).toEqual({ brand: "A&W", name: "Diet" });
    expect(splitLabel("Sprecher")).toEqual({ brand: "Sprecher", name: "Root Beer" });
  });
});

describe("buildRows", () => {
  const data = [
    ["Root Beer", "Rating", "Notes", "Date", "Vibe"],
    ["A&W", "8/10", "Creamy", "2024-01-02", "classic"],
    ["Sprecher", 4.5, "", "", ""],
    [null, null, null, null, null],
    ["Mystery", "ugh", "", "", ""],
  ];
  it("builds rows, converting scale and reporting problems", () => {
    const rows = buildRows(data, 0, detectColumns(data[0] as string[]), 5, [4], data[0] as string[]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ brand: "A&W", rating: 8, notes: "Creamy\nVibe: classic", tastedOn: "2024-01-02" });
    expect(rows[1]).toMatchObject({ brand: "Sprecher", rating: 9 });
    expect(rows[2].problems).toEqual(['Couldn\'t read rating "ugh"']);
  });
});
