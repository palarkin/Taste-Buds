"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin, Search, Store, X } from "lucide-react";
import { findPlaces } from "@/actions/places";

// "Start typing a place" search. Club places first (so everyone reuses the same pin),
// then real-world matches from the place provider. Picking one gives an exact address + map position.

export type ProviderPlace = { externalId: string; name: string; address: string; lat: number; lng: number; category: string | null };
export type ClubPlace = { id: string; name: string; address: string | null; category: string | null };
export type PickedPlace = ({ kind: "club" } & ClubPlace) | ({ kind: "new" } & ProviderPlace);

type Results = { club: (ClubPlace & { lat: number; lng: number })[]; external: ProviderPlace[] };

let cachedPosition: { lat: number; lng: number } | null = null;

/** Bias results toward the user's location, but only if they've already allowed it (never prompts). */
async function quietPosition(): Promise<{ lat: number; lng: number } | null> {
  if (cachedPosition) return cachedPosition;
  try {
    const status = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (status?.state !== "granted") return null;
    return await new Promise((resolve) =>
      navigator.geolocation.getCurrentPosition(
        (p) => resolve((cachedPosition = { lat: p.coords.latitude, lng: p.coords.longitude })),
        () => resolve(null),
        { maximumAge: 10 * 60 * 1000, timeout: 5000 },
      ),
    );
  } catch {
    return null;
  }
}

export function PlacePicker({
  value,
  onChange,
  freeText,
  onFreeTextChange,
  placeholder = "Search a store, brewery or address",
  allowFreeText = true,
  autoFocus = false,
}: {
  value: PickedPlace | null;
  onChange: (p: PickedPlace | null) => void;
  freeText?: string;
  onFreeTextChange?: (t: string) => void;
  placeholder?: string;
  allowFreeText?: boolean;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState(freeText ?? "");
  const [results, setResults] = useState<Results>({ club: [], external: [] });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const near = useRef<{ lat: number; lng: number } | null>(null);
  const seq = useRef(0);
  const listId = useId();

  useEffect(() => {
    const term = q.trim();
    if (value || term.length < 2) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await findPlaces(term, near.current);
        if (id === seq.current) {
          setResults(res);
          setActive(0);
        }
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, value]);

  const options: { key: string; pick: () => void }[] = [
    ...results.club.map((c) => ({ key: `c-${c.id}`, pick: () => select({ kind: "club", id: c.id, name: c.name, address: c.address, category: c.category }) })),
    ...results.external.map((p) => ({ key: `e-${p.externalId}`, pick: () => select({ kind: "new", ...p }) })),
    ...(allowFreeText && q.trim() ? [{ key: "free", pick: () => keepText() }] : []),
  ];

  function select(p: PickedPlace) {
    onChange(p);
    onFreeTextChange?.("");
    setOpen(false);
  }
  function keepText() {
    onFreeTextChange?.(q.trim());
    setOpen(false);
  }

  if (value) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-sassafras/40 bg-cream/50 px-3.5 py-3">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-sassafras" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{value.name}</p>
          <p className="text-sm text-stone-500">{[value.category, value.address].filter(Boolean).join(" · ") || "Address unknown"}</p>
          <p className="mt-0.5 text-xs text-stone-400">{value.kind === "club" ? "Already on the Taste Buds map" : "Will be added to the Taste Buds map"}</p>
        </div>
        <button
          type="button"
          className="rounded-full p-1.5 text-stone-500 hover:bg-crema/60"
          aria-label="Change place"
          onClick={() => {
            onChange(null);
            setQ("");
            setResults({ club: [], external: [] });
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const showList = open && q.trim().length >= 2;
  let idx = -1;
  const optionClass = (i: number) => `flex w-full items-start gap-3 px-3.5 py-2.5 text-left ${i === active ? "bg-cream" : "hover:bg-cream/60"}`;

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-stone-400" />
        <input
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Where did you get it?"
          autoFocus={autoFocus}
          value={q}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={async () => {
            setOpen(true);
            near.current ??= await quietPosition();
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            onFreeTextChange?.(e.target.value.trim());
            if (e.target.value.trim().length < 2) setResults({ club: [], external: [] });
          }}
          onKeyDown={(e) => {
            if (!showList || !options.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % options.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + options.length) % options.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              options[active]?.pick();
            } else if (e.key === "Escape") setOpen(false);
          }}
          className="h-12 w-full rounded-2xl border border-crema bg-white pl-10 pr-10 text-[15px] text-ink shadow-sm outline-none placeholder:text-stone-400 focus:border-sassafras focus:ring-2 focus:ring-sassafras/25"
        />
        {loading && <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-stone-400" />}
      </div>

      {showList && (
        <div id={listId} role="listbox" className="absolute inset-x-0 z-30 mt-1.5 max-h-[60vh] overflow-y-auto rounded-2xl border border-crema bg-white py-1 shadow-xl">
          {results.club.length > 0 && <p className="px-3.5 pb-1 pt-2 text-[12px] font-medium uppercase tracking-wide text-stone-400">On the Taste Buds map</p>}
          {results.club.map((c) => {
            const i = ++idx;
            return (
              <button key={c.id} type="button" role="option" aria-selected={i === active} className={optionClass(i)} onMouseDown={(e) => e.preventDefault()} onClick={options[i].pick}>
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sassafras" />
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{c.name}</span>
                  <span className="block truncate text-sm text-stone-500">{[c.category, c.address].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            );
          })}
          {results.external.length > 0 && <p className="px-3.5 pb-1 pt-2 text-[12px] font-medium uppercase tracking-wide text-stone-400">Places</p>}
          {results.external.map((p) => {
            const i = ++idx;
            return (
              <button key={p.externalId} type="button" role="option" aria-selected={i === active} className={optionClass(i)} onMouseDown={(e) => e.preventDefault()} onClick={options[i].pick}>
                <Store className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{p.name}</span>
                  <span className="block truncate text-sm text-stone-500">{[p.category, p.address].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            );
          })}
          {!loading && results.club.length + results.external.length === 0 && (
            <p className="px-3.5 py-3 text-sm text-stone-500">No places found. Try adding the city, e.g. &ldquo;{q.trim()} Juneau&rdquo;.</p>
          )}
          {allowFreeText && q.trim() && (
            <button
              type="button"
              role="option"
              aria-selected={options.length - 1 === active}
              className={`${optionClass(options.length - 1)} border-t border-crema/70`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={keepText}
            >
              <span className="text-sm text-stone-600">
                Use &ldquo;{q.trim()}&rdquo; without a map pin <span className="text-stone-400">(online, a gift…)</span>
              </span>
            </button>
          )}
          <p className="px-3.5 pb-1.5 pt-1 text-[11px] text-stone-400">Place data © OpenStreetMap contributors</p>
        </div>
      )}
    </div>
  );
}
