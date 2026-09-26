import Link from "next/link";
import { MapPin, ShoppingCart, Users } from "lucide-react";
import { displayName } from "@/lib/normalize";
import { formatPrice, formatRating } from "@/lib/format";
import { CardGrid, CardImage, RatingBadge, Thumb } from "@/components/ui";
import { DataTable, RowLink, Td, Th, Thead, Tr } from "@/components/data-table";
import { FavoriteButton } from "@/components/favorite-button";
import type { DirectoryRow } from "@/lib/queries";

const avg = (r: DirectoryRow) => (r.avg_rating == null ? null : Math.round(r.avg_rating * 10) / 10);

function Untried() {
  return <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">Haven&apos;t tried</span>;
}

export function DirectoryCards({ rows }: { rows: DirectoryRow[] }) {
  return (
    <CardGrid>
      {rows.map((r) => (
        <li key={r.id} className="card group relative flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-sassafras/60 hover:shadow-md">
          <Link href={`/r/${r.slug}`} className="absolute inset-0 z-[1] rounded-2xl" aria-label={displayName(r)} />
          <CardImage url={r.thumb_url} alt={displayName(r)}>
            <div className="absolute right-2 top-2 z-[2] rounded-full bg-white/90 shadow-sm">
              <FavoriteButton rootBeerId={r.id} initial={r.is_favorite} />
            </div>
            <div className="absolute left-2.5 top-2.5">
              {r.my_rating != null ? <RatingBadge rating={r.my_rating} label="My rating" /> : <Untried />}
            </div>
          </CardImage>
          <div className="flex flex-1 flex-col p-3.5">
            <p className="font-semibold leading-snug text-ink">{displayName(r)}</p>
            <p className="mt-0.5 truncate text-xs text-stone-500">{[r.style, r.sweetener, r.origin].filter(Boolean).join(" · ") || " "}</p>
            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-stone-600">
              {r.rater_count > 0 && (
                <span className="flex items-center gap-1" title="Club average">
                  <Users className="h-3.5 w-3.5" /> {formatRating(avg(r))} <span className="text-stone-400">({r.rater_count})</span>
                </span>
              )}
              {r.best_unit_price_cents != null && (
                <span className="flex items-center gap-1"><ShoppingCart className="h-3.5 w-3.5" /> {formatPrice(r.best_unit_price_cents)}/btl</span>
              )}
              {r.location_count > 0 && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {r.location_count}</span>}
            </div>
          </div>
        </li>
      ))}
    </CardGrid>
  );
}

export function DirectoryTable({ rows, sort, sortHref }: { rows: DirectoryRow[]; sort: string; sortHref: (s: string) => string }) {
  return (
    <DataTable label="Root beer directory">
      <Thead>
        <Th href={sortHref("name")} active={sort === "name"} dir="asc">Root beer</Th>
        <Th href={sortHref("my")} active={sort === "my"} align="center">Rank</Th>
        <Th href={sortHref("avg")} active={sort === "avg"} align="center"><abbr title="Club average" className="no-underline">AVG</abbr></Th>
        <Th className="hidden md:table-cell">Style</Th>
        <Th className="hidden lg:table-cell">Sweetener</Th>
        <Th className="hidden xl:table-cell">Origin</Th>
        <Th href={sortHref("price")} active={sort === "price"} dir="asc" align="right" className="hidden sm:table-cell">Online</Th>
        <Th align="center" className="hidden sm:table-cell">Places</Th>
        <Th><span className="sr-only">Favorite</span></Th>
      </Thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.id}>
            <Td>
              <div className="flex items-center gap-2.5">
                <Thumb url={r.thumb_url} alt="" className="h-9 w-9 rounded-lg" />
                <RowLink href={`/r/${r.slug}`}>{displayName(r)}</RowLink>
              </div>
            </Td>
            <Td align="center">{r.my_rating != null ? <RatingBadge rating={r.my_rating} size="sm" label="My rating" /> : <span className="text-stone-300">–</span>}</Td>
            <Td align="center" className="whitespace-nowrap text-stone-600">
              {r.rater_count > 0 ? <>{formatRating(avg(r))} <span className="text-xs text-stone-400">({r.rater_count})</span></> : <span className="text-stone-300">–</span>}
            </Td>
            <Td className="hidden whitespace-nowrap text-stone-600 md:table-cell">{r.style ?? <span className="text-stone-300">–</span>}</Td>
            <Td className="hidden whitespace-nowrap text-stone-600 lg:table-cell">{r.sweetener ?? <span className="text-stone-300">–</span>}</Td>
            <Td className="hidden whitespace-nowrap text-stone-600 xl:table-cell">{r.origin ?? <span className="text-stone-300">–</span>}</Td>
            <Td align="right" className="hidden whitespace-nowrap text-stone-600 sm:table-cell">
              {r.best_unit_price_cents != null ? `${formatPrice(r.best_unit_price_cents)}/btl` : <span className="text-stone-300">–</span>}
            </Td>
            <Td align="center" className="hidden text-stone-600 sm:table-cell">{r.location_count || <span className="text-stone-300">–</span>}</Td>
            <Td align="right" className="relative z-[1] w-10 py-0">
              <FavoriteButton rootBeerId={r.id} initial={r.is_favorite} />
            </Td>
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}
