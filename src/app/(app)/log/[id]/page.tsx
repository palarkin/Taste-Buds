import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, CalendarDays, MapPin, Pencil, ShoppingBag } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { getTasting } from "@/lib/queries";
import { displayName } from "@/lib/normalize";
import { formatDate, formatPrice } from "@/lib/format";
import { RatingBadge } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { MediaGallery } from "@/components/media-gallery";

export async function generateMetadata(props: PageProps<"/log/[id]">) {
  const { id } = await props.params;
  const t = /^[0-9a-f-]{36}$/.test(id) ? await getTasting(id) : null;
  return { title: t ? displayName(t.rootBeer) : "Entry" };
}

export default async function TastingPage(props: PageProps<"/log/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await getTasting(id);
  if (!t) notFound();
  const [owner] = await db.select().from(schema.users).where(eq(schema.users.id, t.tasting.userId));
  const mine = t.tasting.userId === user.id;
  // Members who keep their ratings anonymous don't have their entries opened by others.
  if (!mine && owner && !owner.shareRatings) notFound();
  const firstOwn = t.media.find((m) => m.kind === "image") ?? t.media[0];
  const hero = t.rootBeer.imageUrl
    ? { url: t.rootBeer.imageUrl, kind: "image" as const, catalog: true }
    : firstOwn
      ? { url: firstOwn.url, kind: firstOwn.kind, catalog: false }
      : null;
  const title = displayName(t.rootBeer);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={mine ? "/log" : `/r/${t.rootBeer.slug}`} className="btn-ghost -ml-3 mb-2 px-3 py-1.5">
        <ArrowLeft className="h-4 w-4" /> {mine ? "My Log" : title}
      </Link>

      <div className="card overflow-hidden">
        {/* Same image as the Directory: the catalog photo, falling back to this entry's first photo. */}
        {hero ? (
          <div className={`flex max-h-[60vh] items-center justify-center ${hero.catalog ? "bg-white p-4" : "bg-black"}`}>
            {hero.kind === "video" ? (
              <video src={hero.url} controls playsInline preload="metadata" className="max-h-[56vh] w-full object-contain" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hero.url} alt={title} className="max-h-[56vh] w-full object-contain" />
            )}
          </div>
        ) : (
          <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-cream to-crema text-6xl opacity-70" aria-hidden>🥤</div>
        )}
        <div className="p-5">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <Link href={`/r/${t.rootBeer.slug}`} className="font-display text-3xl font-semibold text-brew-dark hover:underline">{title}</Link>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-500">
                {!mine && owner && <span className="flex items-center gap-1.5"><Avatar name={owner.name} color={owner.color} size="xs" />{owner.name}</span>}
                {t.tasting.tastedOn && <span>Tasted {formatDate(t.tasting.tastedOn)}</span>}
                {t.tasting.source === "import" && <span className="rounded bg-stone-100 px-1.5 text-xs">Imported</span>}
              </div>
            </div>
            <RatingBadge rating={t.tasting.rating} size="lg" />
          </div>
          <p className="mt-4 whitespace-pre-wrap text-stone-800">{t.tasting.notes || <span className="italic text-stone-400">No notes.</span>}</p>
          {(t.location || t.tasting.purchasedFrom || t.tasting.purchasedOn || t.tasting.priceCents != null) && (
            <div className="mt-4 space-y-1.5 rounded-2xl bg-cream/50 p-3.5 text-sm text-stone-700">
              {t.location && (
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sassafras" />
                  <span>
                    <Link href={`/map?loc=${t.location.id}`} className="font-medium hover:underline">{t.location.name}</Link>
                    {t.location.address && <span className="block text-stone-500">{t.location.address}</span>}
                  </span>
                </p>
              )}
              {t.tasting.purchasedFrom && <p className="flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-stone-400" />{t.tasting.purchasedFrom}</p>}
              {(t.tasting.purchasedOn || t.tasting.priceCents != null) && (
                <p className="flex items-center gap-2 text-stone-500">
                  <CalendarDays className="h-4 w-4 text-stone-400" />
                  {t.tasting.purchasedOn ? `Picked up ${formatDate(t.tasting.purchasedOn)}` : "Pickup date not given"}
                  {t.tasting.priceCents != null && ` · ${formatPrice(t.tasting.priceCents)}`}
                </p>
              )}
            </div>
          )}
          {mine && (
            <Link href={`/log/${t.tasting.id}/edit`} className="btn-secondary mt-5">
              <Pencil className="h-4 w-4" /> Edit entry
            </Link>
          )}
        </div>
      </div>

      <section className="card mt-4 p-5">
        <h2 className="mb-3 font-display text-lg font-semibold text-brew-dark">
          {mine ? "Your photos & videos" : `${owner?.name.replace(/\s*\(demo\)/, "") ?? "Their"}'s photos & videos`}
          {t.media.length > 0 && <span className="ml-1.5 text-sm font-normal text-stone-400">{t.media.length}</span>}
        </h2>
        {t.media.length > 0 ? (
          <MediaGallery items={t.media.map((m) => ({ id: m.id, url: m.url, kind: m.kind }))} title={title} />
        ) : (
          <p className="text-sm text-stone-500">
            No photos or videos yet.{" "}
            {mine && <Link href={`/log/${t.tasting.id}/edit`} className="font-medium text-sassafras-dark hover:underline">Add some</Link>}
          </p>
        )}
      </section>
    </div>
  );
}
