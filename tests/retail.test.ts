import { describe, expect, it } from "vitest";
import { cleanProductTitle, isRootBeerProduct, packSize, photoMatches, productMatches } from "@/lib/catalog-import/retail-parse";

describe("isRootBeerProduct", () => {
  it("keeps drinks and drops syrups, candy and merch", () => {
    expect(isRootBeerProduct("Sprecher - Old Fashioned Root Beer 16oz")).toBe(true);
    expect(isRootBeerProduct("Hippo Burly Birch Beer")).toBe(true);
    expect(isRootBeerProduct("Bundaberg Ginger Beer")).toBe(false);
    expect(isRootBeerProduct("Root Beer Barrels Candy")).toBe(false);
    expect(isRootBeerProduct("Rose's Root Beer Simple Syrup")).toBe(false);
  });
});

describe("packSize", () => {
  it("reads common pack formats", () => {
    expect(packSize("Sprecher Root Beer 16oz", "12 Bottles")).toBe(12);
    expect(packSize("Iron Horse Root Beer - 24-Pack")).toBe(24);
    expect(packSize("Chumlee Root Beer 3-Pack Glass Bottles")).toBe(3);
    expect(packSize("Maine Root, Case of 24")).toBe(24);
    expect(packSize("Cicero Salted Caramel Root Beer", "Default Title")).toBe(1);
    expect(packSize("Sprecher Root Beer 16oz")).toBe(1); // "16oz" is a size, not a pack
  });
});

describe("productMatches", () => {
  const sprecher = { brand: "Sprecher", name: "Root Beer" };
  it("matches the plain product and ignores size/packaging words", () => {
    expect(productMatches({ title: "Sprecher - Old Fashioned Root Beer 16oz" }, sprecher)).toBe(true);
    expect(productMatches({ title: "IBC Root Beer 12 oz", vendor: "IBC" }, { brand: "IBC", name: "Root Beer" })).toBe(true);
  });
  it("rejects flavour variants and other brands", () => {
    expect(productMatches({ title: "Sprecher - Smoky Maple Root Beer 16oz" }, sprecher)).toBe(false);
    expect(productMatches({ title: "Sprecher - Smoky Maple Root Beer 16oz" }, { brand: "Sprecher", name: "Smoky Maple Root Beer" })).toBe(true);
    expect(productMatches({ title: "Diet IBC Root Beer" }, { brand: "IBC", name: "Root Beer" })).toBe(false);
    expect(productMatches({ title: "Red Arrow Root Beer" }, sprecher)).toBe(false);
  });
  it("tolerates company words missing from the title", () => {
    expect(productMatches({ title: "Maine Root Root Beer 12oz" }, { brand: "Maine Root Beverage Co", name: "Root Beer" })).toBe(true);
  });
});

describe("more matching", () => {
  it("ignores marketing words", () => {
    expect(productMatches({ title: "The Original Ramblin' Root Beer" }, { brand: "Ramblin", name: "Root Beer" })).toBe(true);
    expect(productMatches({ title: "Virgil's Handcrafted Root Beer" }, { brand: "Virgil's", name: "Root Beer" })).toBe(true);
    expect(productMatches({ title: "Hank's Gourmet Root Beer - 12 oz (12 Glass Bottles)" }, { brand: "Hank's", name: "Root Beer" })).toBe(true);
  });
  it("skips subscriptions and samplers", () => {
    expect(isRootBeerProduct("Subscription - Root Beer")).toBe(false);
    expect(isRootBeerProduct("Root Beer Variety Sampler 6-Pack")).toBe(false);
  });
  it("cleans product titles for naming", () => {
    expect(cleanProductTitle("Dang! Root Beer Soda 12-Pack")).toBe("Dang! Root Beer");
    expect(cleanProductTitle("Iron Horse Root Beer - 24-Pack")).toBe("Iron Horse Root Beer");
    expect(cleanProductTitle("Chumlee Root Beer 3-Pack Glass Bottles")).toBe("Chumlee Root Beer");
    expect(cleanProductTitle("Hank's Gourmet Root Beer - 12 oz (12 Glass Bottles)")).toBe("Hank's Gourmet Root Beer");
  });
});

describe("photoMatches", () => {
  const zero = { brand: "A&W", name: "Zero Sugar" };
  const diet = { brand: "A&W", name: "Diet" };
  const plain = { brand: "A&W", name: "Root Beer" };
  it("never shares a photo between Diet and Zero Sugar", () => {
    expect(photoMatches({ title: "A&W Diet Root Beer" }, zero)).toBe(false);
    expect(photoMatches({ title: "A&W Zero Sugar Root Beer" }, diet)).toBe(false);
    expect(photoMatches({ title: "A&W Zero Sugar Root Beer" }, zero)).toBe(true);
    expect(photoMatches({ title: "Diet Root Beer", brand: "A&W" }, diet)).toBe(true);
  });
  it("keeps variant photos off the regular product", () => {
    expect(photoMatches({ title: "A&W Root Beer 12 fl oz cans, 12 pack" }, plain)).toBe(true);
    expect(photoMatches({ title: "A&W Caffeine Free Root Beer" }, plain)).toBe(false);
    expect(photoMatches({ title: "Sprecher Smoky Maple Root Beer" }, { brand: "Sprecher", name: "Root Beer" })).toBe(false);
    expect(photoMatches({ title: "Barq's Root Beer" }, { brand: "Barq's", name: "Diet" })).toBe(false);
  });
  it("still rejects a different brand", () => {
    expect(photoMatches({ title: "Mug Root Beer" }, plain)).toBe(false);
  });
});
