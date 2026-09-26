import Link from "next/link";
import { Film, Heart, MapPin } from "lucide-react";
import { displayName } from "@/lib/normalize";
import { formatDate } from "@/lib/format";
import { CardGrid, CardImage, RatingBadge, Thumb } from "@/components/ui";
import { DataTable, RowLink, Td, Th, Thead, Tr } from "@/components/data-table";
import type { myLog } from "@/lib/queries";

type Entry = Awaited<ReturnType<typeof myLog>>[number];

const when = (e: Entry) => (e.tasted_on ? formatDate(e.tasted_on) : e.source === "import" ? "Imported" : formatDate(e.created_at));
const where = (e: Entry) => e.place_name ?? e.purchased_from;

export function LogCards({ entries }: { entries: Entry[] }) {
  return (
    <CardGrid>
      {entries.map((e) => (
        <li key={e.id}>
          <Link href={`/log/${e.id}`} className="card group flex h-full flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-sassafras/60 hover:shadow-md">
            <CardImage url={e.thumb_url} kind={e.thumb_kind} alt={displayName(e)}>
              <div className="absolute right-2.5 top-2.5">
                <RatingBadge rating={e.rating} />
              </div>
              {e.is_favorite && (
                <span className="absolute left-2.5 top-2.5 rounded-full bg-white/90 p-1.5 shadow-sm">
                  <Heart className="h-4 w-4 fill-rose-500 text-rose-500" aria-label="Favorite" />
                </span>
              )}
              {e.media_count > 1 && (
                <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">
                  <Film className="h-3 w-3" /> {e.media_count}
                </span>
              )}
            </CardImage>
            <div className="flex flex-1 flex-col p-3.5">
              <p className="font-semibold leading-snug text-ink">{displayName(e)}</p>
              <p className="mt-0.5 text-xs text-stone-500">{[when(e), e.style].filter(Boolean).join(" · ")}</p>
              <p className="mt-2 line-clamp-2 text-sm text-stone-600">{e.notes || <span className="italic text-stone-400">No notes</span>}</p>
              {where(e) && (
                <p className="mt-auto flex items-center gap-1 pt-2 text-xs text-stone-500">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-sassafras" />
                  <span className="truncate">{where(e)}</span>
                </p>
              )}
            </div>
          </Link>
        </li>
      ))}
    </CardGrid>
  );
}

export function LogTable({ entries, sort, sortHref }: { entries: Entry[]; sort: string; sortHref: (s: string) => string }) {
  return (
    <DataTable label="My log">
      <Thead>
        <Th href={sortHref("name")} active={sort === "name"} dir="asc">Root beer</Th>
        <Th href={sortHref(sort === "rating" ? "lowest" : "rating")} active={sort === "rating" || sort === "lowest"} dir={sort === "lowest" ? "asc" : "desc"} align="center">Rating</Th>
        <Th href={sortHref("recent")} active={sort === "recent"}>Tasted</Th>
        <Th className="hidden md:table-cell">Got it at</Th>
        <Th className="hidden lg:table-cell">Style</Th>
        <Th className="hidden sm:table-cell">Notes</Th>
      </Thead>
      <tbody>
        {entries.map((e) => (
          <Tr key={e.id}>
            <Td>
              <div className="flex items-center gap-2.5">
                <Thumb url={e.thumb_url} kind={e.thumb_kind} alt="" className="h-9 w-9 rounded-lg" />
                <span className="min-w-0">
                  <RowLink href={`/log/${e.id}`}>{displayName(e)}</RowLink>
                  {e.is_favorite && <Heart className="ml-1 inline h-3.5 w-3.5 fill-rose-500 text-rose-500" aria-label="Favorite" />}
                </span>
              </div>
            </Td>
            <Td align="center"><RatingBadge rating={e.rating} size="sm" /></Td>
            <Td className="whitespace-nowrap text-stone-600">{when(e)}</Td>
            <Td className="hidden max-w-48 truncate text-stone-600 md:table-cell">{where(e) ?? <span className="text-stone-300">–</span>}</Td>
            <Td className="hidden whitespace-nowrap text-stone-600 lg:table-cell">{e.style ?? <span className="text-stone-300">–</span>}</Td>
            <Td className="hidden max-w-xs truncate text-stone-500 sm:table-cell">{e.notes ?? <span className="text-stone-300">–</span>}</Td>
          </Tr>
        ))}
      </tbody>
    </DataTable>
  );
}
