import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const tastingSource = pgEnum("tasting_source", ["manual", "import"]);
export const mediaKind = pgEnum("media_kind", ["image", "video"]);
export const locationSource = pgEnum("location_source", ["seed", "member"]);
export const importStatus = pgEnum("import_status", ["committed", "undone"]);

// Club members. On handoff to Auth.js this table gains the adapter columns
// (emailVerified, image) and the accounts/sessions/verification_tokens tables.
export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").unique(),
  color: text("color").notNull().default("#8b4513"),
  // Admins can delete places from the map and manage other admins.
  isAdmin: boolean("is_admin").notNull().default(false),
  // Show this member's name (plus notes and photos) next to their ratings. Ratings always count toward averages.
  shareRatings: boolean("share_ratings").notNull().default(true),
  createdAt: createdAt(),
});

// Shared catalog of root beers.
export const rootBeers = pgTable(
  "root_beers",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    brand: text("brand").notNull(),
    name: text("name").notNull().default("Root Beer"),
    maker: text("maker"),
    style: text("style"),
    sweetener: text("sweetener"),
    origin: text("origin"),
    description: text("description"),
    imageUrl: text("image_url"),
    // Where the photo came from, and the exact product it shows (so a mismatch can be spotted).
    imageSource: text("image_source"), // "openfoodfacts" | "retailer:<store>" | null
    imageProductTitle: text("image_product_title"),
    imageSourceUrl: text("image_source_url"),
    // An admin removed a wrong photo: syncs must not add one again.
    imageLocked: boolean("image_locked").notNull().default(false),
    discontinued: boolean("discontinued").notNull().default(false),
    // Where the entry came from: "member" | "openfoodfacts" | "rootbeerbarrel" | "demo".
    source: text("source").notNull().default("member"),
    sourceUrl: text("source_url"),
    // normalized "brand name" used for fuzzy matching (see lib/normalize.ts)
    searchKey: text("search_key").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("root_beers_search_trgm").using("gin", t.searchKey.op("gin_trgm_ops"))],
);

// A root beer can have several barcodes (can, bottle, 4-pack, 12-pack…).
export const rootBeerBarcodes = pgTable("root_beer_barcodes", {
  barcode: text("barcode").primaryKey(),
  rootBeerId: uuid("root_beer_id")
    .notNull()
    .references(() => rootBeers.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("member"),
  addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const locations = pgTable(
  "locations",
  {
    id: id(),
    name: text("name").notNull(),
    address: text("address"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    source: locationSource("source").notNull().default("member"),
    // Stable id from the place-search provider (e.g. "osm:N822543769"), so the same place is never added twice.
    externalId: text("external_id").unique(),
    category: text("category"), // e.g. "brewery", "pub", "supermarket"
    // For pins synced from an outside map: when the latest sync last saw this pin there.
    sourceLastSeenAt: timestamp("source_last_seen_at", { withTimezone: true }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("locations_lat_lng").on(t.lat, t.lng)],
);

// Outside-map pins an admin deleted, so a later sync doesn't bring them back.
export const locationTombstones = pgTable("location_tombstones", {
  externalId: text("external_id").primaryKey(),
  name: text("name").notNull(),
  deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
  deletedAt: createdAt(),
  // Set when the pin was merged into another place: re-adding it (search, sync) resolves to that place.
  mergedInto: uuid("merged_into").references(() => locations.id, { onDelete: "set null" }),
});

// Catalog entries an admin merged away. Their name key and link now resolve to the kept entry,
// so syncs don't re-create them and old /r/<slug> links still work.
export const rootBeerAliases = pgTable("root_beer_aliases", {
  searchKey: text("search_key").primaryKey(),
  slug: text("slug").unique(),
  rootBeerId: uuid("root_beer_id")
    .notNull()
    .references(() => rootBeers.id, { onDelete: "cascade" }),
  mergedBy: uuid("merged_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

// Pairs an admin marked "not duplicates", so the review list stops suggesting them. a_id < b_id.
export const duplicateDismissals = pgTable(
  "duplicate_dismissals",
  {
    kind: text("kind").notNull(), // "place" | "rootbeer"
    aId: uuid("a_id").notNull(),
    bId: uuid("b_id").notNull(),
    dismissedBy: uuid("dismissed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.aId, t.bId] })],
);

// History of syncs from outside sources, with a raw copy of what was downloaded (our backup of their data).
export const sourceSyncs = pgTable("source_syncs", {
  id: id(),
  source: text("source").notNull(), // "communitymap" | "openfoodfacts" | "rootbeerbarrel"
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull().default("running"), // running | ok | failed
  result: jsonb("result"),
  error: text("error"),
  snapshot: text("snapshot"), // raw file as downloaded (e.g. the KML)
  snapshotBytes: integer("snapshot_bytes"),
});

export const importBatches = pgTable("import_batches", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  rowCount: integer("row_count").notNull().default(0),
  createdCount: integer("created_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  // previous values of ratings this batch overwrote, so undo can restore them
  changes: jsonb("changes").$type<ImportChange[]>().notNull().default([]),
  status: importStatus("status").notNull().default("committed"),
  createdAt: createdAt(),
});

export type ImportChange = {
  tastingId: string;
  previous: { rating: number; notes: string | null; tastedOn: string | null } | null; // null = created by batch
};

// One entry per member per root beer (plan decision D2).
export const tastings = pgTable(
  "tastings",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rootBeerId: uuid("root_beer_id")
      .notNull()
      .references(() => rootBeers.id, { onDelete: "cascade" }),
    rating: numeric("rating", { precision: 3, scale: 1, mode: "number" }).notNull(),
    notes: text("notes"),
    tastedOn: date("tasted_on"),
    // When they bought/picked it up. Drives how fresh the map's "in stock" info is.
    purchasedOn: date("purchased_on"),
    priceCents: integer("price_cents"),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    purchasedFrom: text("purchased_from"),
    source: tastingSource("source").notNull().default("manual"),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("tastings_user_root_beer").on(t.userId, t.rootBeerId),
    check("tastings_rating_range", sql`${t.rating} >= 0 AND ${t.rating} <= 10`),
  ],
);

export const media = pgTable("media", {
  id: id(),
  tastingId: uuid("tasting_id")
    .notNull()
    .references(() => tastings.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  kind: mediaKind("kind").notNull(),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const favorites = pgTable(
  "favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rootBeerId: uuid("root_beer_id")
      .notNull()
      .references(() => rootBeers.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.rootBeerId] })],
);

// What's actually on the shelf at a location.
export const locationRootBeers = pgTable(
  "location_root_beers",
  {
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    rootBeerId: uuid("root_beer_id")
      .notNull()
      .references(() => rootBeers.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents"),
    // Most recent known pickup/sighting date. Null = someone got it here but didn't say when.
    lastSeenOn: date("last_seen_on"),
    reportedBy: uuid("reported_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [primaryKey({ columns: [t.locationId, t.rootBeerId] })],
);

export const purchaseLinks = pgTable("purchase_links", {
  id: id(),
  rootBeerId: uuid("root_beer_id")
    .notNull()
    .references(() => rootBeers.id, { onDelete: "cascade" }),
  retailer: text("retailer").notNull(),
  url: text("url").notNull(),
  priceCents: integer("price_cents").notNull(),
  packSize: integer("pack_size").notNull().default(1),
  shippingNote: text("shipping_note"),
  lastCheckedOn: date("last_checked_on").notNull(),
  // "member" (added in the app) or "retailer" (found by the retailer sync, replaced on each sync).
  source: text("source").notNull().default("member"),
  inStock: boolean("in_stock"),
  addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export type User = typeof users.$inferSelect;
export type RootBeer = typeof rootBeers.$inferSelect;
export type Tasting = typeof tastings.$inferSelect;
export type Media = typeof media.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type PurchaseLink = typeof purchaseLinks.$inferSelect;
