"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { addRootBeerListItems, previewRootBeerLists } from "@/actions/catalog-sources";

type Item = { source: "rootbeerrespect" | "rootbeerrating" | "mikebuffington"; title: string; url: string; status: "existing" | "similar" | "new"; match?: string };

const LABEL: Record<Item["source"], string> = {
  rootbeerrespect: "Root Beer Respect",
  rootbeerrating: "Root Beer Rating",
  mikebuffington: "Mike Buffington",
};

/** Check other root beer lists for names we don't have yet; review before anything is added. */
export function NameListImport({ enabled }: { enabled: boolean }) {
  const [pending, start] = useTransition();
  const [items, setItems] = useState<Item[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const key = (i: Item) => `${i.source}|${i.title}`;

  const fresh = items?.filter((i) => i.status === "new") ?? [];
  const similar = items?.filter((i) => i.status === "similar") ?? [];
  const existing = items?.filter((i) => i.status === "existing") ?? [];

  return (
    <div className="py-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Other root beer lists</p>
          <p className="text-sm text-stone-600">
            Root Beer Respect, Root Beer Rating and Mike Buffington&apos;s list. Checks for root beers we don&apos;t have yet. Nothing is added until you review it, and anything that looks like an existing entry is left out.
          </p>
          <p className="mt-0.5 text-xs text-stone-400">Names only; each new entry links back to where it was listed</p>
        </div>
        {enabled && (
          <button
            className="btn-secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setMessage(null);
                const res = await previewRootBeerLists();
                if ("error" in res && res.error) return setMessage(res.error);
                if ("preview" in res && res.preview) {
                  const list = res.preview.classified as Item[];
                  setItems(list);
                  setFailed(res.preview.failed);
                  setPicked(new Set(list.filter((i) => i.status === "new").map(key)));
                }
              })
            }
          >
            {pending && !items ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</> : "Check for new root beers"}
          </button>
        )}
      </div>

      {message && <p className="mt-2 text-sm text-emerald-700">{message}</p>}
      {failed.length > 0 && <p className="mt-2 text-sm text-amber-700">Couldn&apos;t reach: {failed.join(", ")}</p>}

      {items && (
        <div className="mt-4 space-y-4 rounded-2xl bg-cream/40 p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-emerald-50 px-2 py-2 text-emerald-800"><p className="font-display text-2xl font-semibold">{fresh.length}</p><p className="text-xs">New</p></div>
            <div className="rounded-xl bg-amber-50 px-2 py-2 text-amber-800"><p className="font-display text-2xl font-semibold">{similar.length}</p><p className="text-xs">Look similar (skipped)</p></div>
            <div className="rounded-xl bg-stone-50 px-2 py-2 text-stone-600"><p className="font-display text-2xl font-semibold">{existing.length}</p><p className="text-xs">Already in catalog</p></div>
          </div>

          {fresh.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-sm font-semibold text-brew-dark">New root beers to add</p>
                <button className="text-xs font-medium text-sassafras-dark" onClick={() => setPicked(picked.size === fresh.length ? new Set() : new Set(fresh.map(key)))}>
                  {picked.size === fresh.length ? "Untick all" : "Tick all"}
                </button>
              </div>
              <ul className="max-h-80 divide-y divide-crema/70 overflow-y-auto rounded-xl bg-white">
                {fresh.map((i) => {
                  const on = picked.has(key(i));
                  return (
                    <li key={key(i)}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#6b3a1f]"
                          checked={on}
                          onChange={() => {
                            const next = new Set(picked);
                            if (on) next.delete(key(i));
                            else next.add(key(i));
                            setPicked(next);
                          }}
                        />
                        <span className="min-w-0 flex-1 text-sm">{i.title}</span>
                        <span className="shrink-0 text-xs text-stone-400">{LABEL[i.source]}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {similar.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-amber-800">Skipped because they look like existing entries ({similar.length})</summary>
              <p className="mt-1 text-xs text-stone-500">If one is actually different, add it from Log a root beer, or tell an admin.</p>
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm text-stone-600">
                {similar.map((i) => (
                  <li key={key(i)}>{i.title} <span className="text-stone-400">→ looks like</span> {i.match}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary"
              disabled={pending || picked.size === 0}
              onClick={() =>
                start(async () => {
                  const chosen = fresh.filter((i) => picked.has(key(i))).map(({ source, title, url }) => ({ source, title, url }));
                  const res = await addRootBeerListItems(chosen);
                  if ("error" in res && res.error) return setMessage(res.error);
                  if ("result" in res && res.result) {
                    setMessage(`Added ${res.result.added} new root beers.${res.result.skipped.length ? ` Skipped ${res.result.skipped.length} that turned out to be in the catalog already.` : ""}`);
                    setItems(null);
                  }
                })
              }
            >
              {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</> : <><Check className="h-4 w-4" /> Add {picked.size} new root beer{picked.size === 1 ? "" : "s"}</>}
            </button>
            <button className="btn-ghost" disabled={pending} onClick={() => setItems(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
