import { describe, expect, it } from "vitest";
import { guessCategory, parseKml, pinId } from "@/lib/catalog-import/kml";

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Root Beer </name>
<Folder><name>Non-contiguous (AK &amp; HI)</name>
  <Placemark><name>Denali Brewing Co</name><description><![CDATA[House root beer<br>on tap]]></description>
    <styleUrl>#icon-1899</styleUrl><Point><coordinates>-150.0292,62.1615,0</coordinates></Point></Placemark>
  <Placemark><name>No coords</name></Placemark>
</Folder>
<Folder><name>Canada</name>
  <Placemark><name>Soda Shop &amp; More</name><Point><coordinates>
    -79.38,43.65,0
  </coordinates></Point></Placemark>
</Folder></Document></kml>`;

describe("parseKml", () => {
  it("reads pins, notes and regions", () => {
    const { title, pins } = parseKml(KML);
    expect(title).toBe("Root Beer");
    expect(pins).toEqual([
      { name: "Denali Brewing Co", notes: "House root beer\non tap", lat: 62.1615, lng: -150.0292, region: "Non-contiguous (AK & HI)" },
      { name: "Soda Shop & More", notes: null, lat: 43.65, lng: -79.38, region: "Canada" },
    ]);
  });
});

describe("guessCategory", () => {
  it("classifies common names", () => {
    expect(guessCategory("Woodfour Brewing Company")).toBe("Brewery / pub");
    expect(guessCategory("Southbound Taphouse")).toBe("Brewery / pub");
    expect(guessCategory("Rocket Fizz")).toBe("Soda / candy shop");
    expect(guessCategory("Busch's Fresh Food Market")).toBe("Grocery");
    expect(guessCategory("BevMo!")).toBe("Liquor / beverage store");
    expect(guessCategory("C-A-L Ranch Stores")).toBe("Store");
    expect(guessCategory("Mugs-Up Root Beer")).toBe("Root beer stand");
    expect(guessCategory("Thunderhead Tap Room")).toBe("Brewery / pub");
    expect(guessCategory("World's Largest Buffalo Monument")).toBeNull();
  });
});

describe("pinId", () => {
  it("is stable and distinguishes chain locations", () => {
    expect(pinId({ name: "BevMo!", lat: 37.1, lng: -122.2 })).toBe("rbmap:37.10000,-122.20000:bevmo-");
    expect(pinId({ name: "BevMo!", lat: 37.1, lng: -122.2 })).not.toBe(pinId({ name: "BevMo!", lat: 38.1, lng: -121.2 }));
  });
});
