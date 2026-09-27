# Taste-Buds
Where Root Beer connoisseurs track what they've tried and find what they haven't.

A private app for a five-person root beer club: log and rate root beers with photos and video, import existing spreadsheets, browse a shared directory with where-to-buy links, see which nearby stores carry something you haven't tried, and compare ratings on a club leaderboard.

- Product requirements: [`taste-buds-prd.md`](taste-buds-prd.md)
- Build plan: [`taste-buds-build-plan.md`](taste-buds-build-plan.md)
- Moving to Vercel: [`HANDOFF.md`](HANDOFF.md)

## Run it locally

Needs Node 20.9 or newer.

```bash
npm install
echo "SESSION_SECRET=$(openssl rand -hex 32)" > .env.local
npm run dev
```

`npm run dev` starts a private Postgres database for the app (real Postgres, installed through npm, so there's nothing else to set up), then starts the app. Ctrl+C stops both.

Open http://localhost:3000. The first person to open it creates their member profile. Add the rest of the club under **Settings**, or use **Load demo data** there to explore with sample members, root beers, places and prices.

Everything is stored on this computer in `.data/`: the database in `.data/pg`, photos and video in `.data/uploads`. **Settings → Erase all data** resets it.

## Catalog sources

**Settings → Catalog sources** fills the shared catalog. Both are safe to re-run: matches are updated, never duplicated, and details members entered are never overwritten.
- **Open Food Facts**: grocery-store root beers with barcodes, photos and sweetener (open data, ODbL; attribution shown in the app).
- **Community Root Beer Map** (admins only, **Sync now**): about 1,400 places that carry root beer (breweries, soda shops, stores), from the Root Beer Hunters' shared Google My Maps (read from its public KML export). Pins keep their notes; notes that clearly name a root beer are recorded as "carried here" with an unknown date. Addresses are looked up the first time someone opens a pin.
- **Online retailers** (admins only, **Sync now**): finds where each root beer can be bought online by downloading the public product catalogs of five specialty soda shops (Galco's Soda Pop Stop, Beverages Direct, Soda Pop Shop, Yay Soda, Blooms Candy & Soda) and matching products to the catalog. At most 3 links per root beer, most credible store first, with pack price, price per bottle and stock status. Fills in missing product photos. Links members added by hand are kept and count toward the 3. Re-sync to refresh prices.
- **Other root beer lists** (admins only, **Check for new root beers**): Root Beer Respect, Root Beer Rating and Mike Buffington's list, names only. Nothing is added until an admin reviews a preview. Names that match or merely resemble an existing entry are left out, and each chosen name is re-checked on the server as it's added. (Untappd isn't used: its terms forbid scraping, and its "root beer" list is mostly alcoholic.)
- **Anthony's Root Beer Barrel**: about 1,100 names, including craft and regional ones. Names only, read from the site's public WordPress feed; each entry links back to Anthony's review.

**Barcode scanning** (the barcode button next to the root beer search when logging) checks the club catalog, then Open Food Facts. Unknown barcodes can be linked to an existing root beer or added as new, so the next scan finds them. Phone cameras only work over **https** (or on `localhost`), so scanning from a phone works once the app is on Vercel. Until then, you can type the barcode number.

### Catalog photos

A catalog photo is only used when it shows exactly that product:
- Every imported photo records its source (Open Food Facts or a store), the exact product title it was listed under, and a link. That's shown as a caption on the root beer page.
- Before a photo is saved, the source product must match the root beer **including variant words**: Diet, Zero Sugar, Sugar Free, Caffeine Free, Vanilla, Cream, Maple, Birch, Sarsaparilla and so on must agree on both sides (`photoMatches` in `src/lib/catalog-import/retail-parse.ts`). When in doubt, no photo.
- Admins can **remove a wrong photo** on any root beer page. That also locks the entry so syncs never add a photo to it again (and can be undone).
- Members' own tasting photos are separate and unaffected.

### Syncing and backups

Syncing from an outside source is one-way and additive. Everything is copied into our own database, so the app never depends on the source being online.
- **Nothing the club added is ever removed.** A sync only adds new pins and refreshes notes on pins that came from that map.
- **Deleted stays deleted.** If an admin deletes a community pin, it's remembered (`location_tombstones`) and not re-added.
- **Vanished pins are kept.** If a place disappears from the source map, it stays on ours with a note that it's no longer listed there.
- **Every sync saves the raw downloaded file** (`source_syncs.snapshot`) with who ran it and what changed.
- **Settings → Map backup** downloads every place (community + club) as KML (opens in Google My Maps / Google Earth) or CSV, plus the original community map file.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start local Postgres + the app (migrations run automatically on start) |
| `npm test` | Unit tests for the spreadsheet import logic |
| `npm run lint` | ESLint |
| `npx drizzle-kit generate` | Create a migration after changing `src/db/schema.ts` |

## What's where

```
src/
  app/(app)/        pages: log, directory, r/[slug] (root beer), map, leaderboard, import, settings
  app/api/          local photo/video upload and serving (replaced by Vercel Blob on handoff)
  actions/          server actions (every write checks the signed-in member)
  db/               Drizzle schema + database client (node-postgres)
  lib/import/       spreadsheet parsing: column detection, rating scales, dates (unit-tested)
  lib/session.ts    local sign-in (replaced by Auth.js on handoff)
  lib/storage.ts    local file storage (replaced by Vercel Blob on handoff)
drizzle/            SQL migrations
scripts/dev.mjs     starts local Postgres, then `next dev`
tests/              Vitest tests
```

## Status vs. the PRD

| Requirement | Status |
|---|---|
| R1 Individual accounts | ✅ Local "pick your member" sign-in. Google/email sign-in comes with the Vercel handoff |
| R2 Spreadsheet import | ✅ .xlsx/.xls/.csv, column mapping, 5/10/100-point scales, fuzzy catalog matching, conflict handling, undo |
| R3 Logging with rating, notes, photos/video | ✅ 0–10 in half steps; camera or library; photo date pre-fills the tasting date |
| R4 Map showing which root beers each place carries | ✅ Pins colored by "has something you haven't tried"; "I saw this here" |
| R5 Online purchase directory | ✅ Links with pack price and price per bottle |
| R6 Filter and sort | ✅ Tasted/untasted, my rating, style, sweetener, cheapest online |
| R7 Favorites | ✅ |
| R8 Leaderboard | ✅ Average, per-member scores, "Divisive" badge, minimum-raters filter |
| R9 Nearby | ✅ "What's around me" with 5/25/100 mile radius |
