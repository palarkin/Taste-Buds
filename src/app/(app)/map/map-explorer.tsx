"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Crosshair, ExternalLink, Heart, List, Loader2, MapPin, Plus, Trash2, X } from "lucide-react";
import type { MapLocation } from "@/lib/queries";
import { addPlace, createLocation, deleteLocation, removeSighting, reportSighting } from "@/actions/places";
import { lookupAddress } from "@/actions/catalog-sources";
import { useConfirm } from "@/components/confirm-dialog";
import { PlacePicker, type PickedPlace } from "@/components/place-picker";
import { displayName } from "@/lib/normalize";
import { formatDate, formatPrice, freshness, milesBetween } from "@/lib/format";
import { FreshnessLabel, RatingBadge } from "@/components/ui";
import { RootBeerPicker, type PickedRootBeer } from "@/components/root-beer-picker";
import { FilterIconButton, FilterSheet } from "@/components/filter-sheet";
import { activeFilterLabels, option, type FilterSection } from "@/lib/filters";
import { AreaSearch } from "./area-search";
import type { FitArea } from "./map-canvas";

const MapCanvas = dynamic(() => import("./map-canvas"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-cream/50 text-stone-500">Loading map…</div>,
});

export type PinStatus = "untried" | "tried" | "unknown";

// "unknown" = the place carries root beer but nobody has logged which brands yet.
export const PIN_COLORS: Record<PinStatus, string> = { untried: "#10b981", tried: "#b8b2ab", unknown: "#c8742b" };
export function pinStatus(l: MapLocation): PinStatus {
  if (l.items.length === 0) return "unknown";
  return l.items.some((i) => !i.tasted) ? "untried" : "tried";
}

type Filter = "all" | "untried" | "favorites";

const MAP_FILTERS: FilterSection[] = [
  {
    title: "Show",
    fields: [{ type: "segmented", key: "show", defaultValue: "all", options: [option("all", "All places"), option("untried", "New to me"), option("favorites", "Favorites")] }],
    footnote: "“New to me” shows places carrying at least one root beer you haven't tried.",
  },
  {
    title: "Stock reports",
    fields: [{ type: "toggle", key: "recent", label: "Recent reports only", hint: "Picked up or seen in the last 90 days" }],
  },
  {
    title: "Near me distance",
    fields: [{ type: "segmented", key: "radius", defaultValue: "25", options: [option("5", "5 mi"), option("25", "25 mi"), option("100", "100 mi")] }],
    footnote: "Used by “What's around me”.",
  },
];
type Point = { lat: number; lng: number };

export function MapExplorer({ locations, initialSelectedId, isAdmin }: { locations: MapLocation[]; initialSelectedId: string | null; isAdmin: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [me, setMe] = useState<Point | null>(null);
  const [radius, setRadius] = useState(25);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [adding, setAdding] = useState<null | { point?: Point; name?: string; address?: string }>(null);
  const [flyTo, setFlyTo] = useState<Point | null>(null);
  const [fitArea, setFitArea] = useState<FitArea | null>(null);
  const centerRef = useRef<Point | null>(null);
  const getCenter = useCallback(() => centerRef.current, []);

  const visible = useMemo(
    () =>
      locations
        .map((l) => (recentOnly ? { ...l, items: l.items.filter((i) => (freshness(i.last_seen_on).days ?? Infinity) <= 90) } : l))
        .filter((l) => !recentOnly || l.items.length > 0)
        .filter((l) =>
        filter === "untried" ? pinStatus(l) === "untried" : filter === "favorites" ? l.items.some((i) => i.is_favorite) : true,
      ),
    [locations, filter, recentOnly],
  );
  const selected = visible.find((l) => l.id === selectedId) ?? locations.find((l) => l.id === selectedId) ?? null;
  const filterValues = { show: filter, recent: recentOnly ? "1" : "", radius: String(radius) };

  const nearby = useMemo(() => {
    if (!me) return [];
    return visible
      .map((l) => ({ l, miles: milesBetween(me, l) }))
      .filter((x) => x.miles <= radius)
      .sort((a, b) => a.miles - b.miles);
  }, [me, visible, radius]);

  function locate() {
    if (!navigator.geolocation) {
      setGeoError("Location isn't available in this browser.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(p);
        setFlyTo(p);
        setNearbyOpen(true);
        setLocating(false);
      },
      (err) => {
        setGeoError(err.code === err.PERMISSION_DENIED ? "Location permission was denied. Search for an area instead." : "Couldn't get your location.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  const counts = {
    untried: locations.filter((l) => pinStatus(l) === "untried").length,
    tried: locations.filter((l) => pinStatus(l) === "tried").length,
    unknown: locations.filter((l) => pinStatus(l) === "unknown").length,
  };

  return (
    <div className="-mx-4 -mt-6 flex h-[calc(100dvh-3.5rem-4.5rem)] flex-col md:-mb-12 md:h-[calc(100dvh-3.5rem)] lg:-mx-6">
      <div className="z-20 flex items-center gap-2 border-b border-crema bg-foam px-4 py-2">
        <AreaSearch
          getCenter={getCenter}
          onPick={(a) => {
            setSelectedId(null);
            setFitArea({ lat: a.lat, lng: a.lng, bbox: a.bbox });
          }}
        />
        <FilterIconButton count={activeFilterLabels(MAP_FILTERS, filterValues).length} onClick={() => setFiltersOpen(true)} />
        <button onClick={locate} className="btn-secondary h-11 w-11 shrink-0 whitespace-nowrap rounded-full px-0 sm:w-auto sm:px-4" disabled={locating} aria-label="What's around me" title="What's around me">
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
          <span className="hidden sm:inline">What&apos;s around me</span>
        </button>
        <button onClick={() => { setAdding({}); setSelectedId(null); }} className="btn-primary h-11 w-11 shrink-0 whitespace-nowrap rounded-full px-0 sm:w-auto sm:px-4" aria-label="Add place" title="Add place">
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add place</span>
        </button>
      </div>

      <div className="relative flex-1">
        <MapCanvas
          locations={visible}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); setAdding(null); }}
          me={me}
          flyTo={flyTo}
          dropPin={adding?.point ?? null}
          onMapClick={(p) => adding && setAdding({ ...adding, point: p })}
          addMode={!!adding}
          fitArea={fitArea}
          centerRef={centerRef}
        />

        <div className="pointer-events-none absolute left-2 top-2 mr-14 flex flex-wrap gap-x-3 gap-y-0.5 rounded-lg bg-white/90 px-2.5 py-1.5 text-[11px] text-stone-700 shadow">
          <span className="font-semibold text-stone-800">
            {visible.length.toLocaleString()} place{visible.length === 1 ? "" : "s"}
            {activeFilterLabels(MAP_FILTERS, filterValues).map((l) => ` · ${l}`)}
          </span>
          <span className="flex items-center gap-1" title="Has something you haven't tried"><Dot status="untried" /> New to you {counts.untried}</span>
          <span className="flex items-center gap-1" title="You've tried everything known here"><Dot status="tried" /> All tried {counts.tried}</span>
          <span className="flex items-center gap-1" title="Carries root beer, but nobody has logged which brands yet"><Dot status="unknown" /> Brands not logged {counts.unknown}</span>
        </div>

        {geoError && (
          <div className="absolute inset-x-3 top-24 mx-auto max-w-md rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 shadow">
            {geoError} <button className="ml-2 underline" onClick={() => setGeoError(null)}>Dismiss</button>
          </div>
        )}

        {locations.length === 0 && !adding && (
          <div className="absolute inset-x-3 top-24 mx-auto max-w-sm rounded-2xl bg-white p-4 text-center shadow-lg">
            <p className="font-semibold text-brew-dark">No places yet</p>
            <p className="mt-1 text-sm text-stone-600">Add the stores and restaurants where you find root beer, then record what each one carries.</p>
          </div>
        )}

        {adding && (
          <AddPlacePanel
            state={adding}
            onChange={setAdding}
            onFly={setFlyTo}
            onDone={(id) => { setAdding(null); if (id) setSelectedId(id); }}
          />
        )}

        {selected && !adding && <PlaceSheet location={selected} me={me} onClose={() => setSelectedId(null)} isAdmin={isAdmin} />}

        {nearbyOpen && me && !selected && !adding && (
          <div className="absolute inset-x-0 bottom-0 z-10 max-h-[55%] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl md:inset-x-auto md:right-3 md:top-3 md:bottom-3 md:max-h-none md:w-96 md:rounded-2xl">
            <div className="mb-2 flex items-center gap-2">
              <List className="h-5 w-5 text-brew" />
              <h2 className="font-display text-lg font-semibold text-brew-dark">Around you</h2>
              <button className="ml-auto rounded-full p-1 hover:bg-cream" onClick={() => setNearbyOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-2 flex items-center justify-between text-sm text-stone-500">
              Within {radius} miles
              <button className="font-medium text-sassafras-dark" onClick={() => setFiltersOpen(true)}>Change</button>
            </p>
            {nearby.length === 0 ? (
              <p className="text-sm text-stone-500">No {filter === "all" ? "" : "matching "}places within {radius} miles.</p>
            ) : (
              <ul className="divide-y divide-crema/70">
                {nearby.map(({ l, miles }) => {
                  const untried = l.items.filter((i) => !i.tasted).length;
                  return (
                    <li key={l.id}>
                      <button className="flex w-full items-center gap-3 py-2.5 text-left" onClick={() => { setSelectedId(l.id); setFlyTo(l); }}>
                        <Dot status={pinStatus(l)} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{l.name}</p>
                          <p className="text-xs text-stone-500">{l.items.length} known · {untried > 0 ? <span className="font-semibold text-emerald-700">{untried} you haven&apos;t tried</span> : "nothing new for you"}</p>
                        </div>
                        <span className="text-xs tabular-nums text-stone-500">{miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        sections={MAP_FILTERS}
        values={filterValues}
        onApply={(v) => {
          setFilter(v.show as Filter);
          setRecentOnly(v.recent === "1");
          setRadius(Number(v.radius));
        }}
      />
    </div>
  );
}

export function Dot({ status }: { status: PinStatus }) {
  return <span className="inline-block h-3 w-3 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: PIN_COLORS[status] }} />;
}

function PlaceSheet({ location: l, me, onClose, isAdmin }: { location: MapLocation; me: Point | null; onClose: () => void; isAdmin: boolean }) {
  const [confirm, confirmDialog] = useConfirm();
  const [address, setAddress] = useState(l.address);
  const [prevId, setPrevId] = useState(l.id);
  if (prevId !== l.id) {
    setPrevId(l.id);
    setAddress(l.address);
  }
  // Community-map pins arrive without addresses: look one up the first time someone opens the pin, then it's saved.
  useEffect(() => {
    if (l.address) return;
    let live = true;
    lookupAddress(l.id).then((a) => live && a && setAddress(a));
    return () => {
      live = false;
    };
  }, [l.id, l.address]);
  const [adding, setAdding] = useState(false);
  const [rb, setRb] = useState<PickedRootBeer | null>(null);
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`;

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 max-h-[65%] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl md:inset-x-auto md:right-3 md:top-3 md:bottom-3 md:max-h-none md:w-96 md:rounded-2xl">
      <div className="flex items-start gap-2">
        <MapPin className="mt-1 h-5 w-5 shrink-0 text-sassafras" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-semibold text-brew-dark">{l.name}</h2>
          {(l.category || address) && <p className="text-sm text-stone-500">{[l.category, address].filter(Boolean).join(" · ")}</p>}
          {me && <p className="text-xs text-stone-400">{milesBetween(me, l).toFixed(1)} mi away</p>}
        </div>
        <button className="rounded-full p-1 hover:bg-cream" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
      </div>
      {l.notes && <p className="mt-2 whitespace-pre-line rounded-xl bg-cream/60 px-3 py-2 text-sm text-stone-700">{l.notes}</p>}
      {l.goneFromSourceSince ? (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No longer on the community Root Beer Map (last listed {formatDate(l.goneFromSourceSince)}). It may have closed or stopped carrying root beer. Call ahead.
        </p>
      ) : l.fromCommunityMap ? (
        <p className="mt-2 text-xs text-stone-400">From the community Root Beer Map. Call ahead to check they still carry it.</p>
      ) : (
        <p className="mt-2 text-xs text-stone-400">Added by the club.</p>
      )}
      <a href={directions} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-3 py-1.5 text-xs">Directions <ExternalLink className="h-3.5 w-3.5" /></a>

      <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-stone-500">Root beers here</h3>
      {l.items.length === 0 ? (
        <p className="mt-1 text-sm text-stone-500">Known to carry root beer, but no brands logged yet. Been here? Add what you saw.</p>
      ) : (
        <ul className="mt-1 divide-y divide-crema/70">
          {l.items.map((i) => (
            <li key={i.root_beer_id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <Link href={`/r/${i.slug}`} className="font-medium hover:underline">{displayName(i)}</Link>
                {i.is_favorite && <Heart className="ml-1 inline h-3.5 w-3.5 fill-rose-500 text-rose-500" />}
                <p className="flex items-center gap-1.5 text-xs text-stone-500">{i.price_cents != null && <span>{formatPrice(i.price_cents)} ·</span>}<FreshnessLabel date={i.last_seen_on} /></p>
              </div>
              {i.tasted ? <RatingBadge rating={i.my_rating} size="sm" label="My rating" /> : <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">New to you</span>}
              <button
                className="rounded p-1 text-stone-300 hover:text-red-600"
                aria-label="No longer here"
                title="No longer here"
                onClick={async () => {
                  const ok = await confirm({
                    title: "No longer here?",
                    message: `Remove ${displayName(i)} from ${l.name}'s list?`,
                    confirmLabel: "Remove",
                  });
                  if (ok) start(async () => { await removeSighting(l.id, i.root_beer_id); router.refresh(); });
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-3 space-y-2 rounded-xl bg-cream/40 p-3">
          <RootBeerPicker value={rb} onChange={setRb} />
          <input className="input" type="number" step="0.01" min="0" placeholder="Price ($, optional)" value={price} onChange={(e) => setPrice(e.target.value)} />
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button
              className="btn-primary"
              disabled={!rb || pending}
              onClick={() => start(async () => {
                const res = await reportSighting({ locationId: l.id, rootBeerId: rb!.id, price });
                if (res.error) setError(res.error);
                else { setAdding(false); setRb(null); setPrice(""); router.refresh(); }
              })}
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn-primary mt-3 w-full" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> I saw a root beer here</button>
      )}

      {isAdmin && (
        <button
          className="mt-4 text-xs text-stone-400 hover:text-red-600"
          disabled={pending}
          onClick={async () => {
            const ok = await confirm({
              title: `Delete ${l.name}?`,
              message: "Are you sure? This removes the place and everything recorded there from the map for everyone. It can't be undone.",
              confirmLabel: "Delete",
            });
            if (!ok) return;
            start(async () => {
              const res = await deleteLocation(l.id);
              if ("error" in res && res.error) setError(res.error);
              else { onClose(); router.refresh(); }
            });
          }}
        >
          Delete this place
        </button>
      )}
      {error && !adding && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {confirmDialog}
    </div>
  );
}

function AddPlacePanel({
  state,
  onChange,
  onFly,
  onDone,
}: {
  state: { point?: Point; name?: string; address?: string };
  onChange: (s: { point?: Point; name?: string; address?: string }) => void;
  onFly: (p: Point) => void;
  onDone: (id?: string) => void;
}) {
  const [picked, setPicked] = useState<PickedPlace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 max-h-[70%] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl md:inset-x-auto md:right-3 md:top-3 md:bottom-auto md:w-96 md:rounded-2xl">
      <div className="mb-2 flex items-center">
        <h2 className="font-display text-lg font-semibold text-brew-dark">Add a place</h2>
        <button className="ml-auto rounded-full p-1 hover:bg-cream" onClick={() => onDone()} aria-label="Cancel"><X className="h-5 w-5" /></button>
      </div>
      <p className="mb-3 text-sm text-stone-600">Start typing the store or brewery name. Add the city to narrow it down.</p>
      <PlacePicker
        autoFocus
        allowFreeText={false}
        value={picked}
        onChange={(p) => {
          setPicked(p);
          setError(null);
          if (p?.kind === "new") onFly({ lat: p.lat, lng: p.lng });
          if (p?.kind === "club") onDone(p.id);
        }}
      />
      {picked?.kind === "new" && (
        <button
          className="btn-primary mt-3 w-full"
          disabled={pending}
          onClick={() => start(async () => {
            const res = await addPlace({ externalId: picked.externalId, name: picked.name, address: picked.address, lat: picked.lat, lng: picked.lng, category: picked.category });
            if ("error" in res && res.error) setError(res.error);
            else if ("id" in res) { router.refresh(); onDone(res.id); }
          })}
        >
          {pending ? "Adding…" : "Add to the map"}
        </button>
      )}

      {!picked && (
        <details className="mt-4 border-t border-crema pt-3 text-sm" open={!!state.point}>
          <summary className="cursor-pointer text-stone-500">Can&apos;t find it? Drop a pin instead</summary>
          <p className="mt-2 text-xs text-stone-500">{state.point ? `Pin at ${state.point.lat.toFixed(5)}, ${state.point.lng.toFixed(5)}. Tap the map to move it.` : "Tap the map where the place is."}</p>
          {state.point && (
            <div className="mt-2 space-y-2">
              <input className="input" placeholder="Place name *" value={state.name ?? ""} onChange={(e) => onChange({ ...state, name: e.target.value })} />
              <input className="input" placeholder="Address (optional)" value={state.address ?? ""} onChange={(e) => onChange({ ...state, address: e.target.value })} />
              <button
                className="btn-primary w-full"
                disabled={!state.name?.trim() || pending}
                onClick={() => start(async () => {
                  const res = await createLocation({ name: state.name!, address: state.address, lat: state.point!.lat, lng: state.point!.lng });
                  if ("error" in res && res.error) setError(res.error);
                  else if ("location" in res && res.location) { router.refresh(); onDone(res.location.id); }
                })}
              >
                {pending ? "Saving…" : "Save pinned place"}
              </button>
            </div>
          )}
        </details>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
