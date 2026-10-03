import Link from "next/link";
import { Upload } from "lucide-react";
import { requireUser } from "@/lib/session";
import { myLog } from "@/lib/queries";
import { displayName } from "@/lib/normalize";
import { formatRating } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";
import { loadDemoData } from "@/actions/demo";
import { activeFilterLabels, option, readFilters, type FilterSection } from "@/lib/filters";
import { FilterSummary, UrlFilterButton } from "@/components/filter-sheet";
import { SearchInput } from "@/components/search-input";
import { ViewToggle } from "@/components/view-toggle";
import { getViewPref } from "@/lib/view-pref";
import { LogCards, LogTable } from "./views";

export const metadata = { title: "My Log" };

const FILTERS: FilterSection[] = [
  {
    title: "Sort by",
    fields: [
      {
        type: "list",
        key: "sort",
        defaultValue: "recent",
        options: [option("recent", "Most recent"), option("rating", "Highest rated"), option("lowest", "Lowest rated"), option("name", "Name (A–Z)")],
      },
    ],
  },
  {
    title: "Show only",
    fields: [
      { type: "toggle", key: "fav", label: "Favorites" },
      { type: "toggle", key: "media", label: "With photos or video" },
    ],
  },
];

export default async function LogPage(props: PageProps<"/log">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const filters = readFilters(FILTERS, sp);
  const view = await getViewPref("log");
  const sort = filters.sort;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";

  const all = await myLog(user.id);
  const entries = all
    .filter((e) => !q || `${e.brand} ${e.name} ${e.notes ?? ""}`.toLowerCase().includes(q))
    .filter((e) => !filters.fav || e.is_favorite)
    .filter((e) => !filters.media || e.media_count > 0)
    .sort((a, b) => {
      if (sort === "rating") return b.rating - a.rating || a.brand.localeCompare(b.brand);
      if (sort === "lowest") return a.rating - b.rating || a.brand.localeCompare(b.brand);
      if (sort === "name") return displayName(a).localeCompare(displayName(b));
      return (b.tasted_on ?? String(b.created_at)).localeCompare(a.tasted_on ?? String(a.created_at));
    });

  const avg = all.length ? all.reduce((s, e) => s + e.rating, 0) / all.length : null;
  const favs = all.filter((e) => e.is_favorite).length;

  if (all.length === 0) {
    return (
      <>
        <PageHeader title="My Log" subtitle={`Welcome, ${user.name}.`} />
        <EmptyState
          title="Your log is empty"
          action={
            <>
              <Link href="/log/new" className="btn-primary">Log a root beer</Link>
              <Link href="/import" className="btn-secondary"><Upload className="h-4 w-4" /> Import a spreadsheet</Link>
              <form action={async () => { "use server"; await loadDemoData(); }}>
                <button className="btn-ghost">Load demo data</button>
              </form>
            </>
          }
        >
          Log your first root beer, bring over your existing spreadsheet, or load demo data to explore the app.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="My Log"
        action={<Link href="/import" className="btn-secondary"><Upload className="h-4 w-4" /> Import</Link>}
      />

      <p className="mb-4 text-[15px] text-stone-600">
        {all.length} tasted · {formatRating(avg ? Math.round(avg * 10) / 10 : null)} average · {favs} favorite{favs === 1 ? "" : "s"}
      </p>

      <div className="mb-3 flex items-center gap-2">
        <form className="flex-1" action="/log">
          {Object.entries(filters).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
          <SearchInput name="q" defaultValue={q} placeholder="Search my log" />
        </form>
        <UrlFilterButton sections={FILTERS} values={filters} />
        <ViewToggle scope="log" value={view} />
      </div>
      {(q || activeFilterLabels(FILTERS, filters).length > 0) && (
        <FilterSummary count={entries.length} labels={activeFilterLabels(FILTERS, filters)} clearHref={q ? `/log?q=${encodeURIComponent(q)}` : "/log"} />
      )}

      {entries.length === 0 ? (
        <p className="py-10 text-center text-stone-500">Nothing in your log matches{q ? <> &ldquo;{q}&rdquo;</> : " these filters"}.</p>
      ) : (
        view === "cards" ? (
          <LogCards entries={entries} />
        ) : (
          <LogTable entries={entries} sort={sort} sortHref={(next) => `/log?${new URLSearchParams({ ...(q ? { q } : {}), ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), sort: next }).toString()}`} />
        )
      )}
    </>
  );
}
