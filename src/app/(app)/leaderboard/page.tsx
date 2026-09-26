import Link from "next/link";
import { requireUser } from "@/lib/session";
import { directoryRows, distinctValues, listMembers } from "@/lib/queries";
import { displayName } from "@/lib/normalize";

import { EmptyState, PageHeader, RatingBadge } from "@/components/ui";
import { FilterSummary, UrlFilterButton } from "@/components/filter-sheet";
import { activeFilterLabels, option, readFilters, type FilterSection } from "@/lib/filters";

export const metadata = { title: "Leaderboard" };

function leaderboardFilters(memberCount: number, styles: string[]): FilterSection[] {
  const max = Math.max(1, memberCount);
  const sections: FilterSection[] = [
    {
      title: "Sort by",
      fields: [{ type: "segmented", key: "sort", defaultValue: "avg", options: [option("avg", "Top rated"), option("count", "Most rated"), option("divisive", "Divisive")] }],
    },
    {
      title: "Rated by at least",
      fields: [
        {
          type: "segmented",
          key: "min",
          defaultValue: String(Math.min(2, max)),
          options: Array.from({ length: max }, (_, i) => option(String(i + 1), String(i + 1))),
        },
      ],
      footnote: "Members. Raise this so a single 10 doesn't top the chart.",
    },
    {
      title: "Show only",
      fields: [
        { type: "toggle", key: "untried", label: "Ones I haven't tried" },
        { type: "toggle", key: "fav", label: "My favorites" },
      ],
    },
  ];
  if (styles.length) sections.push({ title: "Style", fields: [{ type: "list", key: "style", defaultValue: "", options: [option("", "Any style"), ...styles.map((v) => option(v, v))] }] });
  return sections;
}

export default async function LeaderboardPage(props: PageProps<"/leaderboard">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const [rows, members, styles] = await Promise.all([directoryRows(user.id), listMembers(), distinctValues("style")]);

  const FILTERS = leaderboardFilters(members.length, styles);
  const f = readFilters(FILTERS, sp);
  const minRaters = Number(f.min) || 1;
  const sort = f.sort;
  const untried = f.untried === "1";
  const favs = f.fav === "1";
  const style = f.style;

  const ranked = rows
    .filter((r) => r.rater_count >= minRaters)
    .filter((r) => !untried || r.my_rating == null)
    .filter((r) => !favs || r.is_favorite)
    .filter((r) => !style || r.style === style)
    .map((r) => ({ ...r, spread: (r.max_rating ?? 0) - (r.min_rating ?? 0) }))
    .sort((a, b) => {
      if (sort === "count") return b.rater_count - a.rater_count || b.avg_rating! - a.avg_rating!;
      if (sort === "divisive") return b.spread - a.spread || b.rater_count - a.rater_count;
      return b.avg_rating! - a.avg_rating! || b.rater_count - a.rater_count;
    });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Leaderboard"
        subtitle={`The club's collective favorites across ${members.length} member${members.length === 1 ? "" : "s"}.`}
        action={<UrlFilterButton sections={FILTERS} values={f} />}
      />
      <FilterSummary count={ranked.length} labels={activeFilterLabels(FILTERS, f)} clearHref="/leaderboard" />

      {ranked.length === 0 ? (
        <EmptyState title="Nothing on the board yet">
          {rows.some((r) => r.rater_count > 0) ? "Try lowering the minimum number of raters or clearing filters." : "Once members log or import ratings, the club's rankings show up here."}
        </EmptyState>
      ) : (
        <ol className="space-y-2">
          {ranked.map((r, i) => {
            return (
              <li key={r.id}>
                <Link href={`/r/${r.slug}`} className="card flex items-center gap-3 p-3 transition hover:border-sassafras/60 sm:gap-4">
                  <span className={`w-8 shrink-0 text-center font-display text-xl font-semibold ${i < 3 && sort === "avg" ? "text-sassafras-dark" : "text-stone-400"}`}>
                    {i < 3 && sort === "avg" ? ["🥇", "🥈", "🥉"][i] : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      <span className="truncate">{displayName(r)}</span>
                      {r.spread >= 4 && <span className="rounded-md bg-purple-50 px-1.5 py-0.5 text-[11px] font-semibold text-purple-700">Divisive</span>}
                      {r.my_rating == null && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">Haven&apos;t tried</span>}
                    </p>
                  </div>
                  <div className="text-center">
                    <RatingBadge rating={Math.round(r.avg_rating! * 10) / 10} label="Club average" />
                    <p className="mt-0.5 text-[11px] text-stone-400">{r.rater_count} rated</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
