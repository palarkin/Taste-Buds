"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rm } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { assertAdmin, assertUser, clearSession } from "@/lib/session";
import { searchKey, slugify } from "@/lib/normalize";
import { UPLOAD_DIR } from "@/lib/storage";
import { today } from "@/lib/format";

// Sample data so every screen has something to show before real spreadsheets are imported.
// Everything created here is labelled "(demo)" and wiped by "Erase all data".

const CATALOG: { brand: string; name?: string; style?: string; sweetener?: string; origin?: string }[] = [
  { brand: "A&W", style: "Mainstream", sweetener: "HFCS", origin: "USA" },
  { brand: "Barq's", style: "Mainstream", sweetener: "HFCS", origin: "Mississippi" },
  { brand: "Mug", style: "Mainstream", sweetener: "HFCS", origin: "USA" },
  { brand: "IBC", style: "Mainstream", sweetener: "HFCS", origin: "USA" },
  { brand: "Dad's", style: "Old fashioned", origin: "Illinois" },
  { brand: "Hires", style: "Old fashioned", origin: "Pennsylvania" },
  { brand: "Frostie", style: "Old fashioned", origin: "Georgia" },
  { brand: "Sprecher", style: "Craft", origin: "Wisconsin" },
  { brand: "Virgil's", style: "Craft", sweetener: "Cane sugar" },
  { brand: "Bundaberg", style: "Craft", sweetener: "Cane sugar", origin: "Australia" },
  { brand: "Boylan", style: "Craft", sweetener: "Cane sugar", origin: "New Jersey" },
  { brand: "Abita", style: "Craft", sweetener: "Cane sugar", origin: "Louisiana" },
  { brand: "Stewart's", style: "Craft", origin: "USA" },
  { brand: "Henry Weinhard's", style: "Craft", origin: "Oregon" },
  { brand: "Maine Root", style: "Craft", sweetener: "Cane sugar", origin: "Maine" },
  { brand: "Thomas Kemper", style: "Craft", origin: "Washington" },
  { brand: "Hank's", style: "Craft", sweetener: "Cane sugar", origin: "Pennsylvania" },
  { brand: "Goose Island", style: "Craft", origin: "Illinois" },
  { brand: "Filbert's", style: "Craft", origin: "Illinois" },
  { brand: "Fitz's", style: "Craft", sweetener: "Cane sugar", origin: "Missouri" },
  { brand: "Sioux City", name: "Sarsaparilla", style: "Sarsaparilla", origin: "USA" },
  { brand: "Zevia", style: "Zero sugar", sweetener: "Stevia", origin: "USA" },
  { brand: "A&W", name: "Zero Sugar", style: "Zero sugar", origin: "USA" },
  { brand: "Jones", style: "Craft", sweetener: "Cane sugar", origin: "Washington" },
  { brand: "Saranac", style: "Craft", origin: "New York" },
  { brand: "Point", style: "Craft", origin: "Wisconsin" },
];

const FRIENDS = [
  { name: "Alex (demo)", color: "#0f766e" },
  { name: "Sam (demo)", color: "#7c3aed" },
  { name: "Jordan (demo)", color: "#be123c" },
  { name: "Riley (demo)", color: "#1d4ed8" },
];

const SPOTS = [
  { name: "Corner Market (demo)", category: "Grocery", address: "Near W Division St, Chicago, IL", lat: 41.9036, lng: -87.6769 },
  { name: "Soda Emporium (demo)", category: "Drinks shop", address: "Near N Clark St, Chicago, IL", lat: 41.9407, lng: -87.6545 },
  { name: "Old Town Deli (demo)", category: "Deli", address: "Near N Wells St, Chicago, IL", lat: 41.9112, lng: -87.6346 },
  { name: "Lakeview Liquors (demo)", category: "Liquor store", address: "Near N Broadway, Chicago, IL", lat: 41.9483, lng: -87.6445 },
  { name: "South Loop Grocery (demo)", category: "Grocery", address: "Near S State St, Chicago, IL", lat: 41.8672, lng: -87.6274 },
];

const NOTES = [
  "Strong wintergreen, thin body.",
  "Creamy vanilla finish. Great float candidate.",
  "Big sassafras bite, a little medicinal.",
  "Too sweet for me, but smooth.",
  "Licorice-forward. Divisive.",
  "Honey notes, heavy foam. Excellent.",
  null,
  null,
];

// Mix of fresh, older and undated stock reports so the freshness labels have something to show.
function demoSeenOn(r: number): string | null {
  if (r < 0.15) return null;
  const days = r < 0.55 ? Math.floor(r * 40) : r < 0.8 ? 30 + Math.floor(r * 150) : 200 + Math.floor(r * 900);
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

// Small deterministic PRNG so the demo looks the same every time.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export async function loadDemoData() {
  const me = await assertUser();
  const rand = rng(42);

  await db.transaction(async (tx) => {
    const existingUsers = await tx.select().from(schema.users);
    const members = [...existingUsers];
    for (const f of FRIENDS) {
      if (members.length >= 5) break;
      if (members.some((m) => m.name === f.name)) continue;
      const [u] = await tx.insert(schema.users).values(f).returning();
      members.push(u);
    }

    const rbs = [];
    for (const c of CATALOG) {
      const name = c.name ?? "Root Beer";
      const slug = slugify(name === "Root Beer" ? c.brand : `${c.brand} ${name}`);
      const [rb] = await tx
        .insert(schema.rootBeers)
        .values({ brand: c.brand, name, style: c.style, sweetener: c.sweetener, origin: c.origin, slug, searchKey: searchKey(c.brand, name), createdBy: me.id })
        .onConflictDoUpdate({ target: schema.rootBeers.slug, set: { style: c.style ?? null } })
        .returning();
      rbs.push(rb);
    }

    // Each member has tried a different ~55% of the catalog; ratings cluster around a per-root-beer "quality".
    const quality = rbs.map(() => 3.5 + rand() * 5.5);
    for (const m of members) {
      const isMe = m.id === me.id;
      for (let i = 0; i < rbs.length; i++) {
        if (rand() > (isMe ? 0.45 : 0.55)) continue;
        const rating = Math.max(0, Math.min(10, Math.round((quality[i] + (rand() - 0.5) * 4) * 2) / 2));
        const daysAgo = Math.floor(rand() * 700);
        const d = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
        await tx
          .insert(schema.tastings)
          .values({ userId: m.id, rootBeerId: rbs[i].id, rating, notes: NOTES[Math.floor(rand() * NOTES.length)], tastedOn: d })
          .onConflictDoNothing();
      }
    }

    const locs = [];
    for (const s of SPOTS) {
      const [l] = await tx.insert(schema.locations).values({ ...s, source: "seed", createdBy: me.id }).returning();
      locs.push(l);
    }
    for (const l of locs) {
      const picks = rbs.filter(() => rand() < 0.25);
      for (const rb of picks) {
        await tx
          .insert(schema.locationRootBeers)
          .values({ locationId: l.id, rootBeerId: rb.id, priceCents: 150 + Math.floor(rand() * 350), lastSeenOn: demoSeenOn(rand()), reportedBy: me.id })
          .onConflictDoNothing();
      }
    }

    for (const rb of rbs.filter(() => rand() < 0.6)) {
      const pack = [4, 6, 12][Math.floor(rand() * 3)];
      const q = encodeURIComponent(`${rb.brand} ${rb.name}`);
      await tx.insert(schema.purchaseLinks).values({
        rootBeerId: rb.id,
        retailer: rand() < 0.5 ? "Amazon" : "Walmart",
        url: rand() < 0.5 ? `https://www.amazon.com/s?k=${q}` : `https://www.walmart.com/search?q=${q}`,
        priceCents: pack * (180 + Math.floor(rand() * 200)),
        packSize: pack,
        shippingNote: "Demo price. Check before buying",
        lastCheckedOn: today(),
        addedBy: me.id,
      });
    }
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function eraseAllData() {
  await assertAdmin();
  await db.execute(sql`
    TRUNCATE media, favorites, location_root_beers, purchase_links, tastings, import_batches, locations, root_beers, users CASCADE
  `);
  await rm(UPLOAD_DIR, { recursive: true, force: true });
  await clearSession();
  redirect("/login");
}
