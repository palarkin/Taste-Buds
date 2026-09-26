"use client";

import { useConfirm } from "@/components/confirm-dialog";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash2 } from "lucide-react";
import { confirmPurchaseLink, deletePurchaseLink, reportSighting, addPurchaseLink } from "@/actions/places";
import { mergeRootBeers, removeRootBeerPhoto, unlockRootBeerPhoto, updateRootBeer } from "@/actions/catalog";
import { RootBeerPicker, type PickedRootBeer } from "@/components/root-beer-picker";
import { PlacePicker, type PickedPlace } from "@/components/place-picker";
import { today } from "@/lib/format";

export function AddLinkForm({ rootBeerId }: { rootBeerId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => {
    const res = await addPurchaseLink(prev, fd);
    if (res?.ok) setOpen(false);
    return res;
  }, null);
  if (!open) return <button className="btn-secondary mt-3" onClick={() => setOpen(true)}>+ Add an online source</button>;
  return (
    <form action={action} className="mt-4 grid gap-3 rounded-xl bg-cream/40 p-4 sm:grid-cols-2">
      <input type="hidden" name="rootBeerId" value={rootBeerId} />
      <div><label className="label" htmlFor="link-retailer">Retailer</label><input id="link-retailer" name="retailer" className="input" placeholder="Amazon, Soda Pop Stop…" required /></div>
      <div><label className="label" htmlFor="link-url">Link</label><input id="link-url" name="url" type="url" className="input" placeholder="https://…" required /></div>
      <div><label className="label" htmlFor="link-price">Price ($)</label><input id="link-price" name="price" type="number" step="0.01" min="0.01" className="input" required /></div>
      <div><label className="label" htmlFor="link-packSize">Bottles in pack</label><input id="link-packSize" name="packSize" type="number" min="1" defaultValue={1} className="input" required /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="link-shippingNote">Shipping note <span className="font-normal text-stone-400">(optional)</span></label><input id="link-shippingNote" name="shippingNote" className="input" placeholder="Free shipping over $35" /></div>
      {state?.error && <p className="text-sm text-red-700 sm:col-span-2">{state.error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Add source"}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

export function LinkActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  return (
    <div className="flex gap-1">
      <button className="btn-ghost p-2" title="Price still right? Mark checked today" aria-label="Mark checked today" disabled={pending} onClick={() => start(async () => { await confirmPurchaseLink(id); })}>
        <Check className="h-4 w-4" />
      </button>
      <button className="btn-ghost p-2 text-red-600" aria-label="Remove source" disabled={pending} onClick={async () => { if (await confirm({ title: "Remove this source?", message: "The buy link will be removed for everyone.", confirmLabel: "Remove" })) start(async () => { await deletePurchaseLink(id); }); }}>
        <Trash2 className="h-4 w-4" />
      </button>
      {confirmDialog}
    </div>
  );
}

export function SightingForm({ rootBeerId }: { rootBeerId: string }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [seenOn, setSeenOn] = useState(today());
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button className="btn-secondary mt-3" onClick={() => setOpen(true)}>+ I saw it somewhere</button>;
  return (
    <div className="mt-4 space-y-3 rounded-2xl bg-cream/40 p-4">
      <div>
        <p className="label">Where?</p>
        <PlacePicker value={place} onChange={setPlace} allowFreeText={false} autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="sighting-date">Seen on</label>
          <input id="sighting-date" className="input" type="date" max={today()} value={seenOn} onChange={(e) => setSeenOn(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="sighting-price">Price ($)</label>
          <input id="sighting-price" className="input" type="number" inputMode="decimal" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Optional" />
        </div>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          className="btn-primary"
          disabled={!place || pending}
          onClick={() => start(async () => {
            const res = await reportSighting({
              rootBeerId,
              price,
              seenOn,
              ...(place!.kind === "club"
                ? { locationId: place!.id }
                : { place: { externalId: place!.externalId, name: place!.name, address: place!.address, lat: place!.lat, lng: place!.lng, category: place!.category } }),
            });
            if (res.error) setError(res.error);
            else { setOpen(false); setPlace(null); setPrice(""); setSeenOn(today()); }
          })}
        >
          {pending ? "Saving…" : "Save sighting"}
        </button>
        <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

type RB = { id: string; brand: string; name: string; maker: string | null; style: string | null; sweetener: string | null; origin: string | null; description: string | null; discontinued: boolean };

export function CatalogTools({ rb }: { rb: RB }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateRootBeer.bind(null, rb.id), null);
  const [mergeTarget, setMergeTarget] = useState<PickedRootBeer | null>(null);
  const [merging, start] = useTransition();
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const f = (name: keyof RB, label: string) => (
    <div><label className="label" htmlFor={`rb-${name}`}>{label}</label><input id={`rb-${name}`} name={name} defaultValue={(rb[name] as string) ?? ""} className="input" /></div>
  );
  return (
    <details className="card p-5">
      <summary className="cursor-pointer font-display text-lg font-semibold text-brew-dark">Edit catalog details</summary>
      <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
        {f("brand", "Brand")}
        {f("name", "Name / variety")}
        {f("maker", "Maker")}
        {f("style", "Style")}
        {f("sweetener", "Sweetener")}
        {f("origin", "Origin")}
        <div className="sm:col-span-2"><label className="label" htmlFor="rb-description">Description</label><textarea id="rb-description" name="description" defaultValue={rb.description ?? ""} className="input min-h-20" /></div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="discontinued" defaultChecked={rb.discontinued} /> Discontinued</label>
        {state?.error && <p className="text-sm text-red-700 sm:col-span-2">{state.error}</p>}
        {state?.ok && <p className="text-sm text-emerald-700 sm:col-span-2">Saved.</p>}
        <div className="sm:col-span-2"><button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save details"}</button></div>
      </form>

      <div className="mt-6 border-t border-crema pt-5">
        <h3 className="font-semibold text-brew-dark">Duplicate? Merge into another entry</h3>
        <p className="mb-3 text-sm text-stone-500">Moves everyone&apos;s ratings, photos, links and sightings to the entry you pick, then deletes this one. If someone rated both, their most recent rating is kept.</p>
        <RootBeerPicker value={mergeTarget} onChange={setMergeTarget} />
        {mergeError && <p className="mt-2 text-sm text-red-700">{mergeError}</p>}
        {mergeTarget && (
          <button
            className="btn-danger mt-3"
            disabled={merging || mergeTarget.id === rb.id}
            onClick={async () => {
              const ok = await confirm({
                title: "Merge these entries?",
                message: `Everything on this entry moves to "${mergeTarget.brand} ${mergeTarget.name}", then this entry is deleted. This can't be undone.`,
                confirmLabel: "Merge",
              });
              if (!ok) return;
              start(async () => {
                const res = await mergeRootBeers(rb.id, mergeTarget.id);
                if (res.error) setMergeError(res.error);
                else router.replace(`/r/${res.slug}`);
              });
            }}
          >
            {merging ? "Merging…" : "Merge"}
          </button>
        )}
        {confirmDialog}
      </div>
    </details>
  );
}

export function PhotoAdmin({ id, hasPhoto, locked }: { id: string; hasPhoto: boolean; locked: boolean }) {
  const [pending, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  if (!hasPhoto && !locked) return null;
  return (
    <>
      {hasPhoto ? (
        <button
          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
          disabled={pending}
          onClick={async () => {
            const ok = await confirm({
              title: "Remove this photo?",
              message: "Use this when the photo shows a different product (for example Diet instead of Zero Sugar). Syncs won't add a photo to this root beer again.",
              confirmLabel: "Remove",
            });
            if (ok) start(async () => { await removeRootBeerPhoto(id); });
          }}
        >
          Wrong photo? Remove it
        </button>
      ) : (
        <button className="text-xs font-medium text-sassafras-dark hover:underline" disabled={pending} onClick={() => start(async () => { await unlockRootBeerPhoto(id); })}>
          Photo removed by an admin. Allow syncs to add one again
        </button>
      )}
      {confirmDialog}
    </>
  );
}
