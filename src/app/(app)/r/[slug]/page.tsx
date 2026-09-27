import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { rootBeerAlias } from "@/lib/duplicates";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ExternalLink, MapPin, Pencil, Plus, UserRound } from "lucide-react";
import { requireUser } from "@/lib/session";
import { rootBeerDetail } from "@/lib/queries";
import { displayName } from "@/lib/normalize";
import { formatDate, formatPrice, formatRating } from "@/lib/format";
import { FreshnessLabel, RatingBadge } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { FavoriteButton } from "@/components/favorite-button";
import { AddLinkForm, CatalogTools, LinkActions, PhotoAdmin, SightingForm } from "./client";
import { fillLocationAddress } from "@/lib/catalog-import";
import { Tabs } from "@/components/tabs";

export async function generateMetadata(props: PageProps<"/r/[slug]">) {
  const { slug } = await props.params;
  const [rb] = await db.select({ brand: schema.rootBeers.brand, name: schema.rootBeers.name }).from(schema.rootBeers).where(eq(schema.rootBeers.slug, slug));
  return { title: rb ? displayName(rb) : "Root beer" };
}

export default async function RootBeerPage(props: PageProps<"/r/[slug]">) {
  const user = await requireUser();
  const { slug } = await props.params;
  const d = await rootBeerDetail(slug, user.id);
  if (!d) {
    // Merged into another entry by an admin: old links go to the kept one.
    const alias = await rootBeerAlias({ slug });
    if (alias) redirect(`/r/${alias.slug}`);
    notFound();
  }
  const { rb } = d;
  const title = displayName(rb);
  // At most 3 buy links (in stock, then cheapest per bottle) and 3 places (freshest reports first).
  const links = [...d.links].sort((a, b) => Number(b.link.inStock !== false) - Number(a.link.inStock !== false)).slice(0, 3);
  const spots = await Promise.all(
    d.spots.slice(0, 3).map(async (s) => ({ ...s, address: s.location.address ?? (await fillLocationAddress(s.location.id)) })),
  );
  const spread = d.group.length > 1 ? Math.max(...d.group.map((g) => g.rating)) - Math.min(...d.group.map((g) => g.rating)) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="card p-5">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-semibold text-brew-dark">{title}</h1>
            <p className="mt-1 text-sm text-stone-500">
              {[rb.maker, rb.style, rb.sweetener, rb.origin].filter(Boolean).join(" · ") || "No details yet"}
              {rb.discontinued && <span className="ml-2 rounded bg-stone-800 px-1.5 py-0.5 text-xs font-semibold text-white">Discontinued</span>}
            </p>
            {rb.description && <p className="mt-3 text-stone-700">{rb.description}</p>}
            {rb.sourceUrl && (
              <a href={rb.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-sassafras-dark hover:underline">
                {({ rootbeerbarrel: "Read Anthony's review", openfoodfacts: "View on Open Food Facts", rootbeerrespect: "Read on Root Beer Respect", rootbeerrating: "Read on Root Beer Rating", mikebuffington: "On Mike Buffington's list" } as Record<string, string>)[rb.source] ?? "Source"}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          {rb.imageUrl && (
            <figure className="w-28 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={rb.imageUrl} alt={title} className="h-28 w-28 rounded-xl bg-white object-contain ring-1 ring-crema" />
              {rb.imageSource && (
                <figcaption className="mt-1 text-[10px] leading-tight text-stone-400">
                  Photo:{" "}
                  {rb.imageSourceUrl ? (
                    <a href={rb.imageSourceUrl} target="_blank" rel="noopener noreferrer" className="underline" title={rb.imageProductTitle ?? undefined}>
                      {rb.imageSource === "openfoodfacts" ? "Open Food Facts" : rb.imageSource.replace(/^retailer:/, "")}
                    </a>
                  ) : (
                    rb.imageSource
                  )}
                  {rb.imageProductTitle && <span className="block truncate" title={rb.imageProductTitle}>&ldquo;{rb.imageProductTitle}&rdquo;</span>}
                </figcaption>
              )}
            </figure>
          )}
          <FavoriteButton rootBeerId={rb.id} initial={d.isFavorite} />
        </div>
        {user.isAdmin && (
          <div className="mt-2">
            <PhotoAdmin id={rb.id} hasPhoto={!!rb.imageUrl} locked={rb.imageLocked} />
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {d.mine ? (
            <>
              <Link href={`/log/${d.mine.tasting_id}`} className="btn-secondary">
                <RatingBadge rating={d.mine.rating} size="sm" /> My entry
              </Link>
              <Link href={`/log/${d.mine.tasting_id}/edit`} className="btn-ghost"><Pencil className="h-4 w-4" /> Edit</Link>
            </>
          ) : (
            <Link href={`/log/new?rootBeer=${rb.slug}`} className="btn-primary"><Plus className="h-4 w-4" /> Log it</Link>
          )}
        </div>
      </div>

      {d.gallery.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {d.gallery.map((m) =>
            m.kind === "video" ? (
              <video key={m.id} src={`${m.url}#t=0.1`} className="h-36 w-36 shrink-0 rounded-xl bg-black object-cover" controls playsInline preload="metadata" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={m.id} src={m.url} alt={`${title}, from ${m.member}`} className="h-36 w-36 shrink-0 rounded-xl object-cover" loading="lazy" />
            ),
          )}
        </div>
      )}

      <section className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-brew-dark">Club ratings</h2>
          {d.avg != null && (
            <div className="flex items-center gap-2 text-sm text-stone-500">
              avg <RatingBadge rating={Math.round(d.avg * 10) / 10} /> from {d.group.length}
            </div>
          )}
        </div>
        {spread >= 4 && <p className="mt-2 inline-block rounded-md bg-purple-50 px-2 py-1 text-xs font-semibold text-purple-700">Divisive: scores differ by {formatRating(spread)} points</p>}
        {d.group.length === 0 ? (
          <p className="mt-3 text-sm text-stone-500">Nobody in the club has rated this yet.</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-crema/70">
              {d.group.slice(0, 5).map((g, i) => (
                <li key={g.tasting_id || `anon-${i}`} className="flex items-start gap-3 py-3">
                  {g.tasting_id ? (
                    <Avatar name={g.name} color={g.color} size="sm" />
                  ) : (
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-200 text-stone-500 ring-2 ring-white" aria-hidden>
                      <UserRound className="h-4 w-4" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {g.tasting_id ? (
                        <Link href={`/log/${g.tasting_id}`} className="hover:underline">{g.name}{g.user_id === user.id && <span className="font-normal text-stone-400"> (you)</span>}</Link>
                      ) : (
                        <span className="text-stone-500">{g.name}</span>
                      )}
                      {g.tasted_on && <span className="ml-2 font-normal text-stone-400">{formatDate(g.tasted_on)}</span>}
                    </p>
                    {g.notes && <p className="mt-0.5 line-clamp-3 text-sm text-stone-600">{g.notes}</p>}
                  </div>
                  <RatingBadge rating={g.rating} size="sm" />
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-stone-400">
              Showing {Math.min(5, d.group.length)} of {d.group.length} rating{d.group.length === 1 ? "" : "s"}
              {d.group.length > 5 && " · highest first"}
            </p>
          </>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-display text-xl font-semibold text-brew-dark">Where to find it</h2>
        <Tabs
          defaultId={links.length === 0 && spots.length > 0 ? "in-person" : "online"}
          tabs={[
            {
              id: "online",
              label: "Online",
              count: links.length,
              content: (
                <div className="pt-1">
        {links.length === 0 ? (
          <p className="mt-3 text-sm text-stone-500">No online sources found yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-crema/70">
            {links.map(({ link, addedBy }) => (
              <li key={link.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{link.retailer}</p>
                  <p className="text-sm text-stone-600">
                    {formatPrice(link.priceCents)} for {link.packSize} · <span className="font-semibold">{formatPrice(Math.round(link.priceCents / link.packSize))}/bottle</span>
                    {link.shippingNote && <span className="text-stone-500"> · {link.shippingNote}</span>}
                  </p>
                  <p className="text-xs text-stone-400">
                    Checked {formatDate(link.lastCheckedOn)}
                    {link.source === "retailer" ? " · found by retailer sync" : addedBy ? ` by ${addedBy}` : ""}
                    {link.inStock === false && <span className="ml-1.5 rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-500">Sold out when checked</span>}
                  </p>
                </div>
                {(user.isAdmin || link.source === "member") && <LinkActions id={link.id} />}
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="btn-primary py-2">
                  Buy <ExternalLink className="h-4 w-4" />
                </a>
              </li>
            ))}
          </ul>
        )}
        {(links.length < 3 || user.isAdmin) && <AddLinkForm rootBeerId={rb.id} />}
                </div>
              ),
            },
            {
              id: "in-person",
              label: "In Person",
              count: d.spots.length,
              content: (
                <div className="pt-1">
        {spots.length === 0 ? (
          <p className="mt-3 text-sm text-stone-500">Not on the map yet. Seen it somewhere? Add it below.</p>
        ) : (
          <ul className="mt-3 divide-y divide-crema/70">
            {spots.map((s) => (
              <li key={s.location.id} className="flex items-start gap-3 py-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sassafras" />
                <div className="min-w-0 flex-1">
                  <Link href={`/map?loc=${s.location.id}`} className="font-medium hover:underline">{s.location.name}</Link>
                  <p className="text-sm text-stone-600">{s.address ?? <span className="text-stone-400">Address not available</span>}</p>
                  {s.location.category && <p className="text-xs text-stone-400">{s.location.category}</p>}
                </div>
                <div className="text-right text-xs text-stone-500">
                  {s.priceCents != null && <p className="font-semibold text-stone-700">{formatPrice(s.priceCents)}</p>}
                  <FreshnessLabel date={s.lastSeenOn} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {d.spots.length > spots.length && (
          <Link href="/map" className="mt-1 inline-block text-sm font-medium text-sassafras-dark hover:underline">
            + {d.spots.length - spots.length} more place{d.spots.length - spots.length === 1 ? "" : "s"} on the map
          </Link>
        )}
        <SightingForm rootBeerId={rb.id} />
                  <Link href="/map" className="mt-3 block text-sm font-medium text-sassafras-dark hover:underline">Open the map</Link>
                </div>
              ),
            },
          ]}
        />
      </section>

      {user.isAdmin && <CatalogTools rb={{ id: rb.id, brand: rb.brand, name: rb.name, maker: rb.maker, style: rb.style, sweetener: rb.sweetener, origin: rb.origin, description: rb.description, discontinued: rb.discontinued }} />}
    </div>
  );
}
