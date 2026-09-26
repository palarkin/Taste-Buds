# Handoff: local prototype → Vercel

The app runs locally on stand-ins for each hosted service. Each stand-in sits behind one small module, so moving to Vercel means swapping those modules, not rewriting pages.

| Concern | Local now | On Vercel | File to change |
|---|---|---|---|
| Database | Local Postgres 17 started by `npm run dev` (`.data/pg`) | Neon Postgres via the Vercel Marketplace | Just `DATABASE_URL`. The app already uses the standard `pg` driver |
| Migrations | Run on server start (`src/instrumentation.ts`) | `drizzle-kit migrate` in the build step | `package.json`, `src/instrumentation.ts` |
| Photo/video storage | `.data/uploads` served by `/api/media/[file]` | Vercel Blob | `src/lib/storage.ts`, `src/lib/client/media.ts`, `src/app/api/upload/route.ts` |
| Sign-in | Pick-a-member + signed cookie | Auth.js: Google + email magic link, invite-only | `src/lib/session.ts`, `src/app/(auth)/login` |
| Maps | MapLibre + OpenFreeMap tiles (free, no key) | Can stay as is, or swap to Mapbox | `src/app/(app)/map/map-canvas.tsx` |
| Place search ("Where did you get it?") | Photon (OpenStreetMap data, free public server) | Google Places Autocomplete (New) recommended for the best business coverage; Mapbox Search Box is the cheaper alternative | `src/lib/places.ts` → `searchProvider()`. Keep the `externalId` prefix per provider (`osm:`, `google:`) |

## Status: ready for Vercel

Already done in code:
- **Database:** uses `pg` + `DATABASE_URL`, so Neon's pooled URL works as is. Migrations run in the `vercel-build` script (`drizzle-kit migrate && next build`), not at runtime.
- **Photos/videos:** when a Blob store is connected (`BLOB_READ_WRITE_TOKEN`), browsers upload straight to Vercel Blob (`/api/blob-upload` issues owner-only tokens; `recordUploadedMedia` saves the row). Videos are capped at 50 MB to stay inside the free 1 GB.
- **Access:** set `CLUB_CODE` and visitors must enter it before reaching member sign-in. This is the interim gate until Google/email sign-in (Auth.js) is added.
- **Long syncs:** Settings allows up to 300 s (the Hobby maximum).

## Steps (in the Vercel dashboard, Fraiday Labs team)

1. **Import the project:** Add New → Project → import `palarkin/Taste-Buds`. The framework (Next.js) is detected automatically. Don't deploy yet.
2. **Database:** Storage → Create → **Neon** (Marketplace, Free plan). Connect it to the project for all environments. This adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
3. **File storage:** Storage → Create → **Blob**. Connect it to the project. This adds `BLOB_READ_WRITE_TOKEN`.
4. **Environment variables** (Settings → Environment Variables, all environments):
   - `SESSION_SECRET`: a long random string. Generate one with `openssl rand -hex 32`.
   - `CLUB_CODE`: the phrase you'll give club members.
5. **Deploy.** The first build creates all the tables in Neon.
6. **Set up the club:** open the site, enter the club code, create the first member (they become admin), then add the others in Settings. Run **Settings → Catalog sources** (community map, retailers, Open Food Facts, Root Beer Barrel) to fill the catalog, or move your local data (below).

### Moving local data (optional)
With `npm run dev` running: `pg_dump --no-owner --no-acl postgres://tastebuds:tastebuds@localhost:54329/tastebuds > taste-buds.sql`, then load it into Neon with `psql "$DATABASE_URL_UNPOOLED" < taste-buds.sql`. Local photo uploads (`.data/uploads`) would need re-uploading. There are none yet.

### Later: real sign-in
Replace the club code + pick-a-member sign-in with Auth.js (Google + email magic link via Resend), restricted to emails on the members list. Keep the helper names in `src/lib/session.ts` (`getCurrentUser`, `requireUser`, `assertUser`) so pages don't change.

## Known gaps / next up
- **Map clustering.** Pins are plain markers, which is fine up to a few hundred. Add clustering if the community-map import brings in more.
- **Community Google Map import.** The plan's KML seed script isn't written yet. Ask the map owner first.
- **Photo back-fill** (PRD open question). Not built yet. The photo date is already read from EXIF, which is the groundwork.
- **Tests.** Import parsing is unit-tested. Server actions and end-to-end flows (Playwright) aren't yet.
