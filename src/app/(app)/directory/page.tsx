import Link from "next/link";
import { requireUser } from "@/lib/session";
import { directoryRows, distinctValues } from "@/lib/queries";
import { displayName } from "@/lib/normalize";
import { EmptyState, PageHeader } from "@/components/ui";
import { FilterSummary, UrlFilterButton } from "@/components/filter-sheet";
import { SearchInput } from "@/components/search-input";
import { ViewToggle } from "@/components/view-toggle";
import { getViewPref } from "@/lib/view-pref";
import { DirectoryCards, DirectoryTable } from "./views";
import { activeFilterLabels, option, readFilters, type FilterSection } from "@/lib/filters";

export const metadata = { title: "Directory" };

function directoryFilters(styles: string[], sweeteners: string[]): FilterSection[] {
  const sections: FilterSection[] = [
    {
      title: "Sort by",
      fields: [
        {
          type: "list",
          key: "sort",
          defaultValue: "name",
          options: [
            option("name", "Name (A–Z)"),
            option("my", "My rating"),
            option("avg", "Club average"),
            option("price", "Cheapest online"),
            option("new", "Recently added"),
          ],
        },
      ],
    },
    {
      title: "Show",
      fields: [
        { type: "segmented", key: "status", defaultValue: "all", options: [option("all", "All"), option("untasted", "Haven't tried"), option("tasted", "Tried")] },
      ],
    },
    {
      title: "My rating",
      fields: [{ type: "segmented", key: "min", defaultValue: "", options: [option("", "Any"), option("7", "7+"), option("8", "8+"), option("9", "9+")] }],
      footnote: "Only root beers you've rated at or above this score.",
    },
    {
      title: "Show only",
      fields: [
        { type: "toggle", key: "fav", label: "Favorites" },
        { type: "toggle", key: "online", label: "Available online" },
      ],
    },
  ];
  if (styles.length) sections.push({ title: "Style", fields: [{ type: "list", key: "style", defaultValue: "", options: [option("", "Any style"), ...styles.map((v) => option(v, v))] }] });
  if (sweeteners.length) sections.push({ title: "Sweetener", fields: [{ type: "list", key: "sweetener", defaultValue: "", options: [option("", "Any sweetener"), ...sweeteners.map((v) => option(v, v))] }] });
  return sections;
}

const PAGE = 60;

function str(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

export default async function DirectoryPage(props: PageProps<"/directory">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const [all, styles, sweeteners] = await Promise.all([directoryRows(user.id), distinctValues("style"), distinctValues("sweetener")]);
  const FILTERS = directoryFilters(styles, sweeteners);
  const f = readFilters(FILTERS, sp);
  const params = {
    q: str(sp.q).trim(),
    status: f.status,
    fav: f.fav === "1",
    online: f.online === "1",
    min: Number(f.min) || 0,
    style: f.style,
    sweetener: f.sweetener,
  };
  const sort = f.sort;
  const view = await getViewPref("directory");
  const limit = Math.min(Math.max(Number(str(sp.limit)) || PAGE, PAGE), 5000);

  const q = params.q.toLowerCase();
  const rows = all
    .filter((r) => !q || `${r.brand} ${r.name} ${r.style ?? ""} ${r.origin ?? ""}`.toLowerCase().includes(q))
    .filter((r) => params.status === "all" || (params.status === "tasted" ? r.my_rating != null : r.my_rating == null))
    .filter((r) => !params.fav || r.is_favorite)
    .filter((r) => !params.online || r.link_count > 0)
    .filter((r) => !params.min || (r.my_rating ?? -1) >= params.min)
    .filter((r) => !params.style || r.style === params.style)
    .filter((r) => !params.sweetener || r.sweetener === params.sweetener)
    .sort((a, b) => {
      const nameCmp = displayName(a).localeCompare(displayName(b));
      if (sort === "my") return (b.my_rating ?? -1) - (a.my_rating ?? -1) || nameCmp;
      if (sort === "avg") return (b.avg_rating ?? -1) - (a.avg_rating ?? -1) || b.rater_count - a.rater_count || nameCmp;
      if (sort === "price") return (a.best_unit_price_cents ?? Infinity) - (b.best_unit_price_cents ?? Infinity) || nameCmp;
      if (sort === "new") return String(b.created_at).localeCompare(String(a.created_at));
      return nameCmp;
    });

  const tastedCount = all.filter((r) => r.my_rating != null).length;

  return (
    <>
      <PageHeader
        title="Directory"
        subtitle={`${all.length} root beers in the catalog · you've tried ${tastedCount}`}
        action={<Link href="/log/new" className="btn-secondary py-2">+ Add a root beer</Link>}
      />

      <div className="mb-3 flex items-center gap-2">
        <form className="flex-1" action="/directory">
          {Object.entries(f).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
          <SearchInput name="q" defaultValue={params.q} placeholder="Search brand, style, origin" />
        </form>
        <UrlFilterButton sections={FILTERS} values={f} />
        <ViewToggle scope="directory" value={view} />
      </div>

      {all.length === 0 ? (
        <EmptyState title="The catalog is empty" action={<Link href="/log/new" className="btn-primary">Add the first root beer</Link>}>
          Root beers are added when anyone logs or imports one.
        </EmptyState>
      ) : rows.length === 0 ? (
        <>
          <FilterSummary count={0} labels={activeFilterLabels(FILTERS, f)} clearHref={params.q ? `/directory?q=${encodeURIComponent(params.q)}` : "/directory"} />
          <p className="py-12 text-center text-stone-500">No root beers match{params.q ? <> &ldquo;{params.q}&rdquo;</> : ""} with these filters.</p>
        </>
      ) : (
        <>
          <FilterSummary count={rows.length} labels={activeFilterLabels(FILTERS, f)} clearHref={params.q ? `/directory?q=${encodeURIComponent(params.q)}` : "/directory"} />
          {view === "cards" ? (
            <DirectoryCards rows={rows.slice(0, limit)} />
          ) : (
            <DirectoryTable
              rows={rows.slice(0, limit)}
              sort={sort}
              sortHref={(next) =>
                `/directory?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => typeof v === "string" && k !== "limit") as [string, string][]), sort: next }).toString()}`
              }
            />
          )}
          {rows.length > limit && (
            <div className="mt-5 flex flex-col items-center gap-1">
              <Link
                scroll={false}
                href={{ pathname: "/directory", query: { ...Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string")), limit: String(limit + PAGE) } }}
                className="btn-secondary rounded-full px-6"
              >
                Show more
              </Link>
              <p className="text-xs text-stone-400">Showing {limit} of {rows.length}</p>
            </div>
          )}
        </>
      )}
    </>
  );
}
