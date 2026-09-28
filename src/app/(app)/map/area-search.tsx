"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { findAreas } from "@/actions/places";
import type { AreaHit } from "@/lib/places";

// Map search box: type a city, state or province, zip/postal code, county or country and the map jumps there.
// Results lean toward wherever the map is currently looking ("Portland" near Maine finds Portland, ME first).
export function AreaSearch({ onPick, getCenter }: { onPick: (a: AreaHit) => void; getCenter: () => { lat: number; lng: number } | null }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<AreaHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [searched, setSearched] = useState("");
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 || term === searched) return;
    let stale = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await findAreas(term, getCenter()).catch(() => []);
      if (stale) return;
      setHits(res);
      setActive(0);
      setSearched(term);
      setLoading(false);
      setOpen(true);
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q, searched, getCenter]);

  // Close the list when tapping elsewhere.
  useEffect(() => {
    const onDown = (e: PointerEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  function pick(a: AreaHit) {
    setQ(a.name);
    setSearched(a.name);
    setOpen(false);
    inputRef.current?.blur();
    onPick(a);
  }

  const showList = open && q.trim().length >= 2 && !loading;

  return (
    <div ref={boxRef} className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-stone-400" />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Search the map by city, state, zip code or country"
        placeholder="City, state or zip"
        className="h-11 w-full rounded-full border border-crema bg-white pl-10 pr-3 text-base text-ink shadow-sm outline-none placeholder:text-stone-400 focus:border-sassafras focus:ring-2 focus:ring-sassafras/25 [&::-webkit-search-cancel-button]:hidden"
        value={q}
        style={q ? { paddingRight: "2.25rem" } : undefined}
        onChange={(e) => {
          setQ(e.target.value);
          if (e.target.value.trim().length < 2) {
            setHits([]);
            setLoading(false);
            setSearched("");
          }
        }}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && hits[active]) {
            e.preventDefault();
            pick(hits[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2">
        {loading ? (
          <Loader2 className="m-1.5 h-4 w-4 animate-spin text-stone-400" />
        ) : q ? (
          <button
            type="button"
            aria-label="Clear search"
            className="rounded-full p-1.5 text-stone-400 hover:text-stone-600"
            onClick={() => {
              setQ("");
              setHits([]);
              setSearched("");
              setLoading(false);
              inputRef.current?.focus();
            }}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </span>
      {showList && (
        <ul id={listId} role="listbox" className="absolute left-0 top-12 z-30 max-h-80 w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-crema bg-white py-1 shadow-xl sm:w-96">
          {hits.length === 0 ? (
            <li className="px-3.5 py-3 text-sm text-stone-500">No matching places. Try a city, state, zip code or country.</li>
          ) : (
            hits.map((a, i) => (
              <li key={a.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left ${i === active ? "bg-cream" : "hover:bg-cream/60"}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(a)}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sassafras" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{a.name}</span>
                    <span className="block truncate text-sm text-stone-500">{a.detail}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
