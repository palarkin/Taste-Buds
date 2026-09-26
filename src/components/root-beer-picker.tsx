"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Plus, ScanBarcode, Search, X } from "lucide-react";
import { createRootBeer, searchRootBeers } from "@/actions/catalog";
import { attachBarcode } from "@/actions/catalog-sources";
import { BarcodeScanner } from "./barcode-scanner";
import { displayName } from "@/lib/normalize";

export type PickedRootBeer = { id: string; slug: string; brand: string; name: string };

export function RootBeerPicker({
  value,
  onChange,
  allowScan = false,
}: {
  value: PickedRootBeer | null;
  onChange: (rb: PickedRootBeer | null) => void;
  allowScan?: boolean;
}) {
  const [q, setQ] = useState("");
  const [scanning, setScanning] = useState(false);
  // A scanned barcode nobody has linked yet: whatever the member picks or adds next gets this barcode.
  const [pendingBarcode, setPendingBarcode] = useState<{ code: string; suggestion: { brand: string; name: string } | null } | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [hits, setHits] = useState<PickedRootBeer[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    if (value || q.trim().length < 1) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const res = await searchRootBeers(q);
      if (id === seq.current) setHits(res);
    }, 150);
    return () => clearTimeout(t);
  }, [q, value]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-sassafras/50 bg-cream/60 px-3 py-3">
        <Check className="h-5 w-5 text-emerald-600" />
        <span className="flex-1">
          <span className="block font-semibold">{displayName(value)}</span>
          {scanNote && <span className="block text-xs text-stone-500">{scanNote}</span>}
        </span>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => { onChange(null); setQ(""); setHits([]); setScanNote(null); }}>
          <X className="h-4 w-4" /> Change
        </button>
      </div>
    );
  }

  if (creating) {
    return (
      <NewRootBeerForm
        initialBrand={pendingBarcode?.suggestion?.brand ?? q}
        initialName={pendingBarcode?.suggestion?.name === "Root Beer" ? "" : (pendingBarcode?.suggestion?.name ?? "")}
        barcode={pendingBarcode?.code ?? null}
        pending={pending}
        error={error}
        onCancel={() => setCreating(false)}
        onSubmit={(data) =>
          start(async () => {
            setError(null);
            const res = await createRootBeer({ ...data, barcode: pendingBarcode?.code ?? null });
            if ("error" in res && res.error) setError(res.error);
            else if ("rootBeer" in res && res.rootBeer) {
              if (pendingBarcode) setScanNote("Barcode saved, so the next scan finds it");
              setPendingBarcode(null);
              onChange(res.rootBeer);
              setCreating(false);
            }
          })
        }
      />
    );
  }

  function pick(rb: PickedRootBeer) {
    if (pendingBarcode) {
      const code = pendingBarcode.code;
      start(async () => {
        await attachBarcode(code, rb.id);
      });
      setScanNote("Barcode linked, so the next scan finds it");
      setPendingBarcode(null);
    }
    onChange(rb);
  }

  return (
    <div>
      {allowScan && (
        <BarcodeScanner
          open={scanning}
          onClose={() => setScanning(false)}
          onResult={(o) => {
            if (o.status === "found") {
              setPendingBarcode(null);
              setScanNote(o.source === "openfoodfacts" ? "Found by barcode · added to the catalog from Open Food Facts" : "Found by barcode");
              onChange(o.rootBeer);
            } else {
              setPendingBarcode({ code: o.barcode, suggestion: o.suggestion });
              setQ(o.suggestion?.brand ?? "");
            }
          }}
        />
      )}
      {pendingBarcode && (
        <div className="mb-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <p>
            Nobody has scanned <span className="font-mono">{pendingBarcode.code}</span> yet
            {pendingBarcode.suggestion ? <> (looks like &ldquo;{pendingBarcode.suggestion.brand}&rdquo;)</> : null}. Search for it below to link it, or add it as new.
          </p>
          <button type="button" className="mt-1 text-xs font-medium underline" onClick={() => setPendingBarcode(null)}>Forget this barcode</button>
        </div>
      )}
      <div className="flex gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (!e.target.value.trim()) setHits([]);
          }}
          className="input pl-10"
          placeholder="Search root beers… (e.g. Sprecher)"
          autoComplete="off"
          aria-label="Search root beers"
        />
      </div>
      {allowScan && (
        <button
          type="button"
          onClick={() => setScanning(true)}
          className="inline-flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border border-crema bg-white text-brew hover:bg-cream"
          aria-label="Scan a barcode"
          title="Scan a barcode"
        >
          <ScanBarcode className="h-5 w-5" />
        </button>
      )}
      </div>
      {q.trim() && (
        <ul className="mt-2 overflow-hidden rounded-xl border border-crema bg-white">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => pick(h)} className="block w-full border-b border-crema/60 px-3 py-2.5 text-left hover:bg-cream">
                {displayName(h)}
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setCreating(true)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-medium text-sassafras-dark hover:bg-cream">
              <Plus className="h-4 w-4" /> Add &ldquo;{q.trim()}&rdquo; as a new root beer
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

function NewRootBeerForm({
  initialBrand,
  initialName = "",
  barcode,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  initialBrand: string;
  initialName?: string;
  barcode: string | null;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (d: { brand: string; name: string; style: string; sweetener: string; origin: string }) => void;
}) {
  const [d, setD] = useState({ brand: initialBrand.trim(), name: initialName, style: "", sweetener: "", origin: "" });
  const field = (k: keyof typeof d, label: string, placeholder = "") => (
    <div>
      <label className="label" htmlFor={`nrb-${k}`}>{label}</label>
      <input id={`nrb-${k}`} className="input" value={d[k]} placeholder={placeholder} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
    </div>
  );
  return (
    <div className="rounded-xl border border-crema bg-cream/40 p-4">
      <p className="mb-3 font-semibold text-brew-dark">New root beer</p>
      {barcode && <p className="-mt-2 mb-3 text-xs text-stone-500">Barcode <span className="font-mono">{barcode}</span> will be saved with it.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {field("brand", "Brand *", "Sprecher")}
        {field("name", "Name / variety", "Root Beer")}
        {field("style", "Style", "Craft, Mainstream, Diet…")}
        {field("sweetener", "Sweetener", "Cane sugar, HFCS, Honey…")}
        {field("origin", "Origin", "Wisconsin")}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn-primary" disabled={pending || !d.brand.trim()} onClick={() => onSubmit(d)}>
          {pending ? "Adding…" : "Add to catalog"}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
