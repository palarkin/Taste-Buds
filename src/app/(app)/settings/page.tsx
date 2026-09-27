import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listMembers } from "@/lib/queries";
import { signOut } from "@/actions/auth";
import { PageHeader } from "@/components/ui";
import { AddMemberForm, CatalogSourceRow, DangerZone, MemberRow, PrivacyCard } from "./client";
import { NameListImport } from "./name-lists";
import { catalogSourceCounts, lastSync } from "@/lib/catalog-import";
import { VERIFIED_BREWERIES } from "@/lib/catalog-import/breweries";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Settings" };
// Catalog syncs can take a few minutes (Vercel Hobby allows up to 300s).
export const maxDuration = 300;

export default async function SettingsPage() {
  const user = await requireUser();
  const [members, sources, mapSync, retailSync] = await Promise.all([listMembers(), catalogSourceCounts(), lastSync("communitymap"), lastSync("retailers")]);
  const retailResult = retailSync?.result as { rootBeersWithLinks?: number; links?: number } | null;
  const syncResult = mapSync?.result as { created?: number; goneFromSource?: number } | null;
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Settings" subtitle={`Signed in as ${user.name}`} action={<form action={signOut}><button className="btn-secondary py-2">Sign out</button></form>} />

      <PrivacyCard shareRatings={user.shareRatings} />

      <section className="card p-5">
        <h2 className="font-display text-xl font-semibold text-brew-dark">Club members</h2>
        <p className="text-sm text-stone-500">Everyone here can sign in and appears on the leaderboard. The live version will only allow invited emails. Admins can also delete places from the map.</p>
        <ul className="mt-3 divide-y divide-crema/70">
          {members.map((m) => (
            <MemberRow key={m.id} member={{ id: m.id, name: m.name, email: m.email, color: m.color, isAdmin: m.isAdmin }} isMe={m.id === user.id} viewerIsAdmin={user.isAdmin} />
          ))}
        </ul>
        <AddMemberForm />
      </section>

      <section className="card p-5">
        <h2 className="font-display text-xl font-semibold text-brew-dark">Your data</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/import" className="btn-secondary">Import a spreadsheet</Link>
          <Link href="/import/history" className="btn-ghost">Past imports</Link>
        </div>
      </section>

      {user.isAdmin && (
        <section className="card p-5">
          <h2 className="font-display text-xl font-semibold text-brew-dark">Duplicates</h2>
          <p className="text-sm text-stone-500">Places and root beers that look like they&apos;re listed twice. Merge them, delete one, or mark them as different.</p>
          <div className="mt-3">
            <Link href="/settings/duplicates" className="btn-secondary">Review duplicates</Link>
          </div>
        </section>
      )}

      <section className="card p-5">
        <h2 className="font-display text-xl font-semibold text-brew-dark">Catalog sources</h2>
        <p className="text-sm text-stone-500">
          Pull in data from outside sources. Syncing only adds and updates. It never deletes anything the club added, and everything is stored in Taste Buds, so nothing is lost if a source goes offline.
          {!user.isAdmin && " Only admins can sync."}
          {" "}{sources.barcodes} barcode{sources.barcodes === 1 ? "" : "s"} known.
        </p>
        <div className="mt-3 divide-y divide-crema/70">
          <CatalogSourceRow
            source="openfoodfacts"
            title="Open Food Facts"
            detail="Grocery-store root beers, birch beers and sarsaparillas with barcodes, photos and sweetener. Open data (ODbL). Takes about a minute."
            credit="Product data © Open Food Facts contributors, openfoodfacts.org"
            count={sources.bySource.openfoodfacts ?? 0}
            canSync={user.isAdmin}
          />
          <CatalogSourceRow
            source="rootbeerbarrel"
            title="Anthony's Root Beer Barrel"
            detail="About 1,100 root beers, birch beers and sarsaparillas, including many craft and regional ones. Names only; each entry links to Anthony's review."
            credit="Names from rootbeerbarrel.com"
            count={sources.bySource.rootbeerbarrel ?? 0}
            canSync={user.isAdmin}
          />
          <CatalogSourceRow
            source="retailers"
            title="Online retailers"
            detail="Finds where each root beer can be bought online from specialty soda shops: Galco's Soda Pop Stop, Beverages Direct, Soda Pop Shop, Yay Soda and Blooms. Up to 3 per root beer, most credible first, with prices and photos. Re-sync to refresh prices."
            credit="Links go to each store's own product page"
            count={retailResult?.rootBeersWithLinks ?? 0}
            unit="root beers with buy links"
            canSync={user.isAdmin}
            status={retailSync ? (retailSync.status === "failed" ? `Last sync failed ${formatDate(retailSync.startedAt)}: ${retailSync.error}` : `Last synced ${formatDate(retailSync.startedAt)}${retailSync.by ? ` by ${retailSync.by}` : ""}`) : null}
          />
          <NameListImport enabled={user.isAdmin} />
          <CatalogSourceRow
            source="breweries"
            title="Breweries that serve root beer"
            detail={`${VERIFIED_BREWERIES.length} breweries (${VERIFIED_BREWERIES.reduce((n, b) => n + b.locations.length, 0)} locations) where the brewery's own website lists root beer on its menu or taps, checked by hand (hard root beers and root beer stouts don't count). Adds them to the map, skipping any already there.`}
            credit="Addresses from Open Brewery DB (openbrewerydb.org)"
            count={sources.breweryPins}
            unit="brewery pins on map"
            canSync={user.isAdmin}
          />
          <CatalogSourceRow
            source="communitymap"
            title="Community Root Beer Map"
            detail="About 1,500 breweries, soda shops and stores that carry root beer, from the Root Beer Hunters' shared Google map. Adds places to the Taste Buds map."
            credit="Map by therootbeermap@gmail.com (send them corrections too)"
            count={sources.communityPins}
            unit="places on map"
            canSync={user.isAdmin}
            status={
              mapSync
                ? mapSync.status === "failed"
                  ? `Last sync failed ${formatDate(mapSync.startedAt)}: ${mapSync.error}`
                  : `Last synced ${formatDate(mapSync.startedAt)}${mapSync.by ? ` by ${mapSync.by}` : ""}${syncResult?.created != null ? ` · ${syncResult.created} new` : ""}${syncResult?.goneFromSource ? ` · ${syncResult.goneFromSource} no longer on their map (kept)` : ""}`
                : null
            }
          />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-display text-xl font-semibold text-brew-dark">Map backup</h2>
        <p className="text-sm text-stone-500">
          Every place is stored in Taste Buds: {sources.communityPins.toLocaleString()} from the community map and {sources.clubPlaces.toLocaleString()} added by the club.
          {sources.dismissedPins > 0 && ` ${sources.dismissedPins} community pin${sources.dismissedPins === 1 ? " an admin deleted stays" : "s admins deleted stay"} deleted when syncing.`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href="/api/export/places?format=kml" className="btn-secondary">Download all places (KML)</a>
          <a href="/api/export/places?format=csv" className="btn-secondary">Download all places (CSV)</a>
          {mapSync?.snapshotBytes ? <a href="/api/export/community-snapshot" className="btn-ghost">Original community map file ({(mapSync.snapshotBytes / 1024 / 1024).toFixed(1)} MB)</a> : null}
        </div>
        <p className="mt-2 text-xs text-stone-400">KML files open in Google My Maps and Google Earth, so the whole map can be rebuilt anywhere.</p>
      </section>

      <DangerZone isAdmin={user.isAdmin} />
    </div>
  );
}
