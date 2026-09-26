"use client";

import { useConfirm } from "@/components/confirm-dialog";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Loader2, Star, Trash2, X } from "lucide-react";
import { deleteMedia, deleteTasting, moveMediaFirst, saveTasting } from "@/actions/tastings";
import { prepareFile, uploadMedia, type PreparedFile } from "@/lib/client/media";
import { today } from "@/lib/format";
import { RatingSlider } from "./rating-slider";
import { RootBeerPicker, type PickedRootBeer } from "./root-beer-picker";
import { PlacePicker, type PickedPlace } from "./place-picker";

type ExistingMedia = { id: string; url: string; kind: "image" | "video" };

export type TastingFormProps = {
  mode: "new" | "edit";
  tastingId?: string;
  initial?: {
    rootBeer: PickedRootBeer;
    rating: number;
    notes: string | null;
    tastedOn: string | null;
    purchasedOn: string | null;
    priceCents: number | null;
    location: { id: string; name: string; address: string | null; category: string | null } | null;
    purchasedFrom: string | null;
  };
  existingMedia?: ExistingMedia[];
  presetRootBeer?: PickedRootBeer | null;
  alreadyLogged?: Record<string, string>; // rootBeerId -> tastingId
};

export function TastingForm(props: TastingFormProps) {
  const router = useRouter();
  const [rootBeer, setRootBeer] = useState<PickedRootBeer | null>(props.initial?.rootBeer ?? props.presetRootBeer ?? null);
  const [rating, setRating] = useState(props.initial?.rating ?? 5);
  const [notes, setNotes] = useState(props.initial?.notes ?? "");
  const [tastedOn, setTastedOn] = useState(props.initial?.tastedOn ?? (props.mode === "new" ? today() : ""));
  const [place, setPlace] = useState<PickedPlace | null>(props.initial?.location ? { kind: "club", ...props.initial.location } : null);
  const [purchasedFrom, setPurchasedFrom] = useState(props.initial?.purchasedFrom ?? "");
  const [purchasedOn, setPurchasedOn] = useState(props.initial?.purchasedOn ?? "");
  const [price, setPrice] = useState(props.initial?.priceCents != null ? (props.initial.priceCents / 100).toFixed(2) : "");
  const [pendingFiles, setPendingFiles] = useState<PreparedFile[]>([]);
  const [progress, setProgress] = useState<Record<number, number>>({});
  const [existing, setExisting] = useState<ExistingMedia[]>(props.existingMedia ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const dateTouched = useRef(props.mode === "edit");

  const duplicateId = props.mode === "new" && rootBeer ? props.alreadyLogged?.[rootBeer.id] : undefined;

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const prepared = await Promise.all([...list].map(prepareFile));
    setPendingFiles((p) => [...p, ...prepared]);
    // Photo capture date is a better guess than "today" for back-filled tastings.
    const first = prepared.find((p) => p.kind === "image" && p.takenAt);
    if (first?.takenAt && !dateTouched.current) {
      const d = first.takenAt;
      setTastedOn(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
  }

  async function onSave() {
    if (!rootBeer) {
      setError("Pick a root beer first");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await saveTasting({
      rootBeerId: rootBeer.id,
      rating,
      notes,
      tastedOn,
      purchasedOn,
      price,
      purchasedFrom,
      place: !place ? null : place.kind === "club" ? { locationId: place.id } : { externalId: place.externalId, name: place.name, address: place.address, lat: place.lat, lng: place.lng, category: place.category },
    });
    if ("error" in res && res.error) {
      setError(res.error);
      setSaving(false);
      return;
    }
    const id = (res as { id: string }).id;
    try {
      for (let i = 0; i < pendingFiles.length; i++) {
        await uploadMedia(id, pendingFiles[i], (f) => setProgress((p) => ({ ...p, [i]: f })));
      }
    } catch (e) {
      setError(`Saved, but an upload failed: ${(e as Error).message}`);
      setSaving(false);
      router.refresh();
      return;
    }
    router.push(`/log/${id}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="card p-4 sm:p-5">
        <h2 className="label text-base">Root beer</h2>
        {props.mode === "edit" && rootBeer ? (
          <p className="font-semibold">{rootBeer.brand} {rootBeer.name !== "Root Beer" && rootBeer.name}</p>
        ) : (
          <RootBeerPicker value={rootBeer} onChange={setRootBeer} allowScan />
        )}
        {duplicateId && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            You&apos;ve already logged this one. Saving will update your existing entry.
          </p>
        )}
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="label mb-3 text-base">Your rating</h2>
        <RatingSlider value={rating} onChange={setRating} />
      </section>

      <section className="card space-y-4 p-4 sm:p-5">
        <div>
          <h2 className="label text-base">Where did you get it?</h2>
          <PlacePicker value={place} onChange={setPlace} freeText={purchasedFrom} onFreeTextChange={setPurchasedFrom} />
          {!place && purchasedFrom && <p className="mt-1.5 text-xs text-stone-500">Saved as &ldquo;{purchasedFrom}&rdquo; without a map pin. Pick a suggestion to put it on the map.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="purchasedOn">Picked up</label>
            <input id="purchasedOn" type="date" className="input" value={purchasedOn} max={today()} onChange={(e) => setPurchasedOn(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="price">Price paid <span className="font-normal text-stone-400">($)</span></label>
            <input id="price" type="number" inputMode="decimal" step="0.01" min="0" className="input" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <p className="-mt-1 text-xs text-stone-500">
          The pickup date tells the club how likely it is to still be in stock.{" "}
          {!purchasedOn && tastedOn && (
            <button type="button" className="font-medium text-sassafras-dark" onClick={() => setPurchasedOn(tastedOn)}>
              Same day I tasted it
            </button>
          )}
        </p>
      </section>

      <section className="card space-y-4 p-4 sm:p-5">
        <div className="max-w-[50%] pr-1.5">
          <label className="label" htmlFor="tastedOn">Tasted</label>
          <input
            id="tastedOn"
            type="date"
            className="input"
            value={tastedOn ?? ""}
            max={today()}
            onChange={(e) => {
              dateTouched.current = true;
              setTastedOn(e.target.value);
            }}
          />
        </div>
        <div>
          <label className="label text-base" htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            className="input min-h-28"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Sassafras? Vanilla? Wintergreen? Foam, body, finish…"
          />
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="label text-base">Photos &amp; video</h2>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {existing.map((m, i) => (
            <div key={m.id} className="group relative aspect-square overflow-hidden rounded-xl bg-stone-100">
              {m.kind === "video" ? (
                <video src={`${m.url}#t=0.1`} className="h-full w-full object-cover" muted playsInline preload="metadata" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt="" className="h-full w-full object-cover" />
              )}
              {i === 0 && <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[10px] font-semibold text-white">Cover</span>}
              <div className="absolute inset-x-1 bottom-1 flex justify-end gap-1">
                {i > 0 && (
                  <button
                    type="button"
                    className="rounded-full bg-white/90 p-1.5 shadow"
                    aria-label="Make cover photo"
                    onClick={() => start(async () => {
                      await moveMediaFirst(m.id);
                      setExisting((ex) => [m, ...ex.filter((x) => x.id !== m.id)]);
                    })}
                  >
                    <Star className="h-4 w-4 text-amber-500" />
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-full bg-white/90 p-1.5 shadow"
                  aria-label="Delete"
                  onClick={async () => {
                    if (!(await confirm({ title: "Delete this photo?", message: "It will be removed from this entry.", confirmLabel: "Delete" }))) return;
                    start(async () => {
                      await deleteMedia(m.id);
                      setExisting((ex) => ex.filter((x) => x.id !== m.id));
                    });
                  }}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </button>
              </div>
            </div>
          ))}
          {pendingFiles.map((p, i) => (
            <div key={p.previewUrl} className="relative aspect-square overflow-hidden rounded-xl bg-stone-100">
              {p.kind === "video" ? (
                <video src={p.previewUrl} className="h-full w-full object-cover" muted playsInline />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
              )}
              {saving ? (
                <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/30">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((progress[i] ?? 0) * 100)}%` }} />
                </div>
              ) : (
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded-full bg-white/90 p-1 shadow"
                  aria-label="Remove"
                  onClick={() => setPendingFiles((ps) => ps.filter((_, j) => j !== i))}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => cameraRef.current?.click()}>
            <Camera className="h-4 w-4" /> Take photo / video
          </button>
          <button type="button" className="btn-secondary" onClick={() => libraryRef.current?.click()}>
            <ImagePlus className="h-4 w-4" /> Choose from library
          </button>
          <input ref={cameraRef} type="file" accept="image/*,video/*" capture="environment" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <input ref={libraryRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </div>
        <p className="mt-2 text-xs text-stone-500">Photos up to 15 MB (large ones are shrunk automatically). Videos up to 50 MB (about 30 seconds).</p>
      </section>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

      <div className="sticky bottom-20 z-20 flex gap-2 md:bottom-4">
        <button type="button" className="btn-primary flex-1 py-3.5 text-base shadow-lg" onClick={onSave} disabled={saving || !rootBeer}>
          {saving ? <><Loader2 className="h-5 w-5 animate-spin" /> Saving…</> : props.mode === "new" ? "Save to my log" : "Save changes"}
        </button>
        {props.mode === "edit" && props.tastingId && (
          <button
            type="button"
            className="btn-danger py-3.5 shadow-lg"
            disabled={saving}
            onClick={async () => {
              if (!(await confirm({ title: "Delete this entry?", message: "Your rating, notes and photos for this root beer will be deleted. This can't be undone.", confirmLabel: "Delete" }))) return;
              start(async () => {
                await deleteTasting(props.tastingId!);
                router.push("/log");
                router.refresh();
              });
            }}
          >
            <Trash2 className="h-5 w-5" />
          </button>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
