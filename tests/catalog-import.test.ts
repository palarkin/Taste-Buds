import { describe, expect, it } from "vitest";
import { detectSweetener, fromOpenFoodFacts, fromRootBeerBarrel, normalizeBarcode, tidyCase } from "@/lib/catalog-import/parse";

describe("fromOpenFoodFacts", () => {
  const drink = ["en:beverages", "en:carbonated-drinks", "en:sodas", "en:root-beers"];
  it("cleans brand and name", () => {
    expect(fromOpenFoodFacts({ brands: "A&W, Keurig Dr Pepper", product_name: "ROOT BEER", categories_tags: drink, ingredients_text: "Carbonated water, high fructose corn syrup" }))
      .toEqual({ brand: "A&W", name: "Root Beer", style: null, sweetener: "HFCS" });
    expect(fromOpenFoodFacts({ brands: "A&W", product_name: "A&W Zero Sugar Root Beer", categories_tags: drink }))
      .toMatchObject({ brand: "A&W", name: "Zero Sugar", style: "Diet" });
    expect(fromOpenFoodFacts({ brands: null, product_name: "Mug Root Beer", categories_tags: drink }))
      .toMatchObject({ brand: "Mug", name: "Root Beer" });
    expect(fromOpenFoodFacts({ brands: "Polar", product_name: "Birch Beer", categories_tags: ["en:beverages", "en:sodas"] }))
      .toMatchObject({ brand: "Polar", name: "Birch Beer", style: "Birch beer" });
  });
  it("cleans messy comma lists and corporate names", () => {
    expect(fromOpenFoodFacts({ brands: "Day's Beverages Inc.", product_name: "Day's, Old Fashioned", categories_tags: drink }))
      .toMatchObject({ brand: "Day's Beverages", name: "Day's Old Fashioned" });
    expect(fromOpenFoodFacts({ brands: ["Diet Barq’s"], product_name: "Root Beer", categories_tags: drink }))
      .toMatchObject({ brand: "Barq's", name: "Diet", style: null });
    expect(fromOpenFoodFacts({ brands: "Bashas' Markets", product_name: "Fiesta!, soda, , root beer", categories_tags: drink }))
      .toMatchObject({ brand: "Bashas' Markets", name: "Fiesta!" });
    expect(fromOpenFoodFacts({ brands: "Best Yet", product_name: "birch beer", categories_tags: ["en:beverages", "en:sodas"] }))
      .toMatchObject({ name: "Birch Beer" });
    expect(fromOpenFoodFacts({ brands: "Mug", product_name: "Mug Root Beer", categories_tags: drink, ingredients_tags: ["en:carbonated-water", "en:high-fructose-corn-syrup"] }))
      .toMatchObject({ sweetener: "HFCS" });
  });
  it("skips junk brands", () => {
    expect(fromOpenFoodFacts({ brands: "/", product_name: "Root Beer", categories_tags: drink })).toBeNull();
  });
  it("skips mis-tagged other flavors", () => {
    expect(fromOpenFoodFacts({ brands: "Beaver Buzz", product_name: "Energy Drink", categories_tags: drink })).toBeNull();
    expect(fromOpenFoodFacts({ brands: "Zevia", product_name: "Ginger Root Beer", categories_tags: drink })).toMatchObject({ name: "Ginger" });
  });
  it("skips candy and non-drinks", () => {
    expect(fromOpenFoodFacts({ brands: "Rite Aid", product_name: "Root Beer Barrels", categories_tags: ["en:confectioneries"] })).toBeNull();
    expect(fromOpenFoodFacts({ brands: "X", product_name: "Root beer float ice cream", categories_tags: ["en:beverages"] })).toBeNull();
    expect(fromOpenFoodFacts({ brands: "OLIPOP", product_name: "Cream Soda", categories_tags: drink.slice(0, 3) })).toBeNull();
  });
});

describe("fromRootBeerBarrel", () => {
  it("splits maker from product", () => {
    expect(fromRootBeerBarrel("Pirate Pete’s Soda Pop Co Jolly Roger Root Beer", "root", false)).toMatchObject({ brand: "Pirate Pete's Soda Pop Co", name: "Jolly Roger Root Beer" });
    expect(fromRootBeerBarrel("Otto’s Pub and Brewery Root Beer", "root", false)).toMatchObject({ brand: "Otto's Pub and Brewery", name: "Root Beer" });
    expect(fromRootBeerBarrel("Jolt Root Beer", "root", false)).toMatchObject({ brand: "Jolt", name: "Root Beer" });
    expect(fromRootBeerBarrel("Shy Bear Brewing White Birch Beer", "birch", false)).toMatchObject({ brand: "Shy Bear Brewing", name: "White Birch Beer", style: "Birch beer" });
    expect(fromRootBeerBarrel("Talking Rain Beverages Sparkling Ice Caffeine Root Beer", "root", true)).toMatchObject({ brand: "Talking Rain Beverages", style: "Diet" });
    expect(fromRootBeerBarrel("Dog n Suds Sugar Free Root Beer", "root", true)).toMatchObject({ brand: "Dog n Suds", name: "Sugar Free Root Beer" });
    expect(fromRootBeerBarrel("Foodtown Old Fashioned Root Beer", "root", false)).toMatchObject({ brand: "Foodtown", name: "Old Fashioned Root Beer" });
    expect(fromRootBeerBarrel("Sprecher Energy", "other", false)).toBeNull();
    expect(fromRootBeerBarrel("Forty Ninth State Brewing Frontier Spruce Beer", "other", false)).toMatchObject({ style: "Spruce beer" });
    expect(fromRootBeerBarrel("Parlor Butterscotch Root Beer", "root", false)).toMatchObject({ brand: "Parlor", name: "Butterscotch Root Beer" });
  });
});

describe("helpers", () => {
  it("detects sweeteners", () => {
    expect(detectSweetener("water, cane sugar, natural flavors")).toBe("Cane sugar");
    expect(detectSweetener("water, honey")).toBe("Honey");
    expect(detectSweetener("water, sucralose")).toBe("Artificial sweetener");
    expect(detectSweetener(null)).toBeNull();
  });
  it("tidies ALL CAPS", () => {
    expect(tidyCase("BARQ'S ROOT BEER")).toBe("Barq's Root Beer");
    expect(tidyCase("IBC")).toBe("IBC");
  });
  it("normalizes barcodes", () => {
    expect(normalizeBarcode("0 78000 05342 5")).toBe("078000053425");
    expect(normalizeBarcode("0078000053425")).toBe("078000053425");
    expect(normalizeBarcode("abc")).toBeNull();
  });
});
