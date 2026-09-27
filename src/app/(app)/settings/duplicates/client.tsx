"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/confirm-dialog";
import { EmptyState, Thumb } from "@/components/ui";
import { deleteRootBeer, dismissDuplicate, mergeDuplicate } from "@/actions/duplicates";
import { deleteLocation } from "@/actions/places";
import type { DuplicateKind, DuplicatePair, PlaceSide, RootBeerSide } from "@/lib/duplicates";

const PAGE = 20;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

type Side = { id: string; title: string };

/** Shared list behaviour: resolved pairs disappear right away, then the list is recomputed on the server. */
function PairList<T extends Side>({
  kind,
  pairs,
  empty,
  renderSide,
  movedSummary,
  deleteBlocked,
}: {
  kind: DuplicateKind;
  pairs: DuplicatePair<T>[];
  empty: string;
  renderSide: (s: T) => ReactNode;
  movedSummary: (s: T) => string;
  deleteBlocked?: (s: T) => string | null;
}) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [gone, setGone] = useState<Set<string>>(new Set()); // removed entries and dismissed pairs
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const key = (p: DuplicatePair<T>) => `${p.a.id}:${p.b.id}`;
  const visible = pairs.filter((p) => !gone.has(p.a.id) && !gone.has(p.b.id) && !gone.has(key(p)));

  async function run(p: DuplicatePair<T>, action: string, fn: () => Promise<{ error?: string } | { ok: boolean }>, hide: string[]) {
    setBusy(`${key(p)}:${action}`);
    setErrors((e) => {
      const next = { ...e };
      delete next[key(p)];
      return next;
    });
    const res = await fn();
    setBusy(null);
    if ("error" in res && res.error) {
      setErrors((e) => ({ ...e, [key(p)]: res.error! }));
      return;
    }
    setGone((g) => new Set([...g, ...hide]));
    startTransition(() => router.refresh());
  }

  async function keep(p: DuplicatePair<T>, keeper: T, other: T) {
    const moved = movedSummary(other);
    const ok = await confirm({
      title: `Keep “${keeper.title}”?`,
      message: (
        <>
          {other.title === keeper.title ? "The other copy" : `“${other.title}”`} will be merged into it{moved ? `: ${moved} move over` : ""}. Then it&apos;s removed. This can&apos;t be undone.
        </>
      ),
      confirmLabel: "Merge",
      destructive: false,
    });
    if (ok) await run(p, `keep:${keeper.id}`, () => mergeDuplicate({ kind, keepId: keeper.id, dropId: other.id }), [other.id]);
  }

  async function remove(p: DuplicatePair<T>, side: T) {
    const ok = await confirm({
      title: `Delete “${side.title}”?`,
      message: kind === "place" ? "It's removed from the map for everyone, along with its stock reports." : "It's removed from the catalog for everyone.",
    });
    if (ok) await run(p, `delete:${side.id}`, () => (kind === "place" ? deleteLocation(side.id) : deleteRootBeer(side.id)), [side.id]);
  }

  if (!visible.length) return <div className="mt-4"><EmptyState title="Nothing to review">{empty}</EmptyState></div>;

  return (
    <div className="mt-4 space-y-4">
      {visible.slice(0, shown).map((p) => (
        <article key={key(p)} className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-stone-600">{p.reason}</p>
            <button
              type="button"
              className="btn-ghost py-1.5 text-sm"
              disabled={!!busy}
              onClick={() => run(p, "dismiss", () => dismissDuplicate({ kind, aId: p.a.id, bId: p.b.id }), [key(p)])}
            >
              {busy === `${key(p)}:dismiss` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Not duplicates
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[
              [p.a, p.b],
              [p.b, p.a],
            ].map(([side, other]) => {
              const blocked = deleteBlocked?.(side) ?? null;
              return (
                <div key={side.id} className="flex flex-col rounded-2xl bg-stone-50 p-3 ring-1 ring-crema">
                  <div className="flex-1">{renderSide(side)}</div>
                  <div className="mt-3 flex items-center gap-2">
                    <button type="button" className="btn-secondary flex-1 py-2 text-sm" disabled={!!busy} onClick={() => keep(p, side, other)}>
                      {busy === `${key(p)}:keep:${side.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Keep this one
                    </button>
                    <button
                      type="button"
                      className="btn-ghost p-2 text-red-600 disabled:text-stone-300"
                      disabled={!!busy || !!blocked}
                      title={blocked ?? `Delete ${side.title}`}
                      aria-label={`Delete ${side.title}`}
                      onClick={() => remove(p, side)}
                    >
                      {busy === `${key(p)}:delete:${side.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {errors[key(p)] && <p className="mt-2 text-sm text-red-600" role="alert">{errors[key(p)]}</p>}
        </article>
      ))}
      {visible.length > shown && (
        <div className="text-center">
          <button type="button" className="btn-secondary" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({visible.length - shown} left)
          </button>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

function OpenLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} target="_blank" className="inline-flex items-center gap-1 font-semibold text-ink hover:text-sassafras-dark">
      {children}
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-stone-400" />
    </Link>
  );
}

export function PlacePairs({ pairs }: { pairs: DuplicatePair<PlaceSide>[] }) {
  const withTitles = pairs.map((p) => ({ ...p, a: { ...p.a, title: p.a.name }, b: { ...p.b, title: p.b.name } }));
  return (
    <PairList
      kind="place"
      pairs={withTitles}
      empty="No places close together with similar names."
      movedSummary={(s) => [s.rootBeers && plural(s.rootBeers, "stock report"), s.tastings && plural(s.tastings, "rating")].filter(Boolean).join(" and ")}
      renderSide={(s) => (
        <div className="space-y-1 text-sm">
          <OpenLink href={`/map?loc=${s.id}`}>{s.name}</OpenLink>
          {s.address && <p className="text-stone-600">{s.address}</p>}
          <p className="text-xs text-stone-500">
            {s.origin}
            {s.category ? ` · ${s.category}` : ""} · {shortDate(s.createdAt)}
          </p>
          <p className="text-xs text-stone-500">
            {plural(s.rootBeers, "root beer")} reported · {plural(s.tastings, "rating")} bought here
          </p>
          {s.notes && <p className="line-clamp-3 whitespace-pre-line text-xs text-stone-500">{s.notes}</p>}
        </div>
      )}
    />
  );
}

export function RootBeerPairs({ pairs }: { pairs: DuplicatePair<RootBeerSide>[] }) {
  const title = (s: RootBeerSide) => (s.name.toLowerCase() === "root beer" ? `${s.brand} Root Beer` : `${s.brand} ${s.name}`);
  const withTitles = pairs.map((p) => ({ ...p, a: { ...p.a, title: title(p.a) }, b: { ...p.b, title: title(p.b) } }));
  return (
    <PairList
      kind="rootbeer"
      pairs={withTitles}
      empty="No catalog entries with near-identical names."
      movedSummary={(s) =>
        [s.tastings && plural(s.tastings, "rating"), s.places && plural(s.places, "place"), s.links && plural(s.links, "buy link"), s.barcodes && plural(s.barcodes, "barcode")]
          .filter(Boolean)
          .join(", ")
      }
      deleteBlocked={(s) => (s.tastings ? `Has ${plural(s.tastings, "rating")}. Merge it instead so they aren't lost.` : null)}
      renderSide={(s) => (
        <div className="flex gap-3 text-sm">
          <Thumb url={s.imageUrl} alt={s.title} className="h-14 w-14 shrink-0" />
          <div className="min-w-0 space-y-1">
            <OpenLink href={`/r/${s.slug}`}>{s.title}</OpenLink>
            <p className="text-xs text-stone-500">
              {s.style ? `${s.style} · ` : ""}From {s.source} · {shortDate(s.createdAt)}
            </p>
            <p className="text-xs text-stone-500">
              {plural(s.tastings, "rating")} · {plural(s.places, "place")} · {plural(s.links, "buy link")} · {plural(s.barcodes, "barcode")}
            </p>
          </div>
        </div>
      )}
    />
  );
}
