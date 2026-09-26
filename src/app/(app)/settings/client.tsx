"use client";

import { useConfirm } from "@/components/confirm-dialog";
import { useActionState, useState, useTransition } from "react";
import { addMember, setAdmin, setShareRatings, updateMember } from "@/actions/auth";
import { Switch } from "@/components/filter-sheet";
import { eraseAllData, loadDemoData } from "@/actions/demo";
import { runCommunityMapImport, runOpenFoodFactsImport, runRetailerSync, runRootBeerBarrelImport } from "@/actions/catalog-sources";
import { Loader2 } from "lucide-react";
import { Avatar } from "@/components/avatar";

type Member = { id: string; name: string; email: string | null; color: string; isAdmin: boolean };

export function MemberRow({ member, isMe, viewerIsAdmin }: { member: Member; isMe: boolean; viewerIsAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminPending, startAdmin] = useTransition();
  const [state, action, pending] = useActionState(async (prev: unknown, fd: FormData) => {
    const res = await updateMember(member.id, prev, fd);
    if (res?.ok) setEditing(false);
    return res;
  }, null);
  if (!editing) {
    return (
      <li className="flex flex-wrap items-center gap-3 py-3">
        <Avatar name={member.name} color={member.color} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {member.name} {isMe && <span className="text-xs text-stone-400">(you)</span>}
            {member.isAdmin && <span className="ml-1.5 rounded-full bg-brew/10 px-2 py-0.5 text-[11px] font-semibold text-brew">Admin</span>}
          </p>
          <p className="truncate text-xs text-stone-500">{member.email || "No email yet"}</p>
        </div>
        {viewerIsAdmin && (
          <label className="flex items-center gap-2 text-xs text-stone-500">
            Admin
            <Switch
              label={`${member.name} is an admin`}
              checked={member.isAdmin}
              onChange={(on) => startAdmin(async () => {
                setAdminError(null);
                const res = await setAdmin(member.id, on);
                if (res?.error) setAdminError(res.error);
              })}
            />
          </label>
        )}
        <button className="btn-ghost py-1.5" disabled={adminPending} onClick={() => setEditing(true)}>Edit</button>
        {adminError && <p className="basis-full text-right text-xs text-red-700">{adminError}</p>}
      </li>
    );
  }
  return (
    <li className="py-3">
      <form action={action} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input name="name" defaultValue={member.name} className="input" required aria-label="Name" />
        <input name="email" type="email" defaultValue={member.email ?? ""} className="input" placeholder="Email" aria-label="Email" />
        <input name="color" type="color" defaultValue={member.color} className="h-11 w-14 cursor-pointer rounded-xl border border-crema bg-white p-1" aria-label="Color" />
        {state?.error && <p className="text-sm text-red-700 sm:col-span-3">{state.error}</p>}
        <div className="flex gap-2 sm:col-span-3">
          <button className="btn-primary py-2" disabled={pending}>Save</button>
          <button type="button" className="btn-ghost py-2" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </form>
    </li>
  );
}

export function AddMemberForm() {
  const [state, action, pending] = useActionState(addMember, null);
  return (
    <form action={action} className="mt-4 grid gap-2 rounded-xl bg-cream/40 p-3 sm:grid-cols-[1fr_1fr_auto]">
      <input name="name" className="input" placeholder="Name" required aria-label="New member name" />
      <input name="email" type="email" className="input" placeholder="Email (optional)" aria-label="New member email" />
      <button className="btn-primary" disabled={pending}>Add member</button>
      {state?.error && <p className="text-sm text-red-700 sm:col-span-3">{state.error}</p>}
    </form>
  );
}

export function DangerZone({ isAdmin }: { isAdmin: boolean }) {
  const [pending, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const [done, setDone] = useState(false);
  return (
    <section className="card p-5">
      <h2 className="font-display text-xl font-semibold text-brew-dark">Demo &amp; reset</h2>
      <p className="text-sm text-stone-500">Load sample members, root beers, ratings, places and buy links to try every screen. Demo entries are labelled &ldquo;(demo)&rdquo;.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-secondary" disabled={pending} onClick={() => start(async () => { await loadDemoData(); setDone(true); })}>
          {pending ? "Working…" : done ? "Demo data loaded ✓" : "Load demo data"}
        </button>
        {isAdmin && <button
          className="btn-danger"
          disabled={pending}
          onClick={async () => {
            const ok = await confirm({
              title: "Erase all data?",
              message: "Every member, root beer, rating, photo and place on this computer will be deleted. This can't be undone.",
              confirmLabel: "Erase",
            });
            if (ok) start(async () => { await eraseAllData(); });
          }}
        >
          Erase all data
        </button>}
      </div>
      {confirmDialog}
    </section>
  );
}

export function CatalogSourceRow({
  source,
  title,
  detail,
  credit,
  count,
  unit = "in catalog",
  canSync,
  status = null,
}: {
  source: "openfoodfacts" | "rootbeerbarrel" | "communitymap" | "retailers";
  title: string;
  detail: string;
  credit: string;
  count: number;
  unit?: string;
  canSync: boolean;
  status?: string | null;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-start gap-3 py-4">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title} <span className="text-sm font-normal text-stone-400">· {count} {unit}</span></p>
        <p className="text-sm text-stone-600">{detail}</p>
        <p className="mt-0.5 text-xs text-stone-400">{credit}</p>
        {status && !message && <p className="mt-1 text-xs text-stone-500">{status}</p>}
        {message && <p className="mt-1 text-sm text-emerald-700">{message}</p>}
      </div>
      {canSync && <button
        className="btn-secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage(null);
            if (source === "retailers") {
              const res = await runRetailerSync();
              if ("error" in res && res.error) setMessage(res.error);
              else if ("result" in res && res.result) {
                const r = res.result;
                setMessage(
                  `${r.links} buy links for ${r.rootBeersWithLinks} root beers · ${r.imagesAdded} photos added · ${r.newRootBeers} new root beers` +
                    (r.failedStores.length ? ` · couldn't reach: ${r.failedStores.join(", ")}` : ""),
                );
              }
              return;
            }
            if (source === "communitymap") {
              const res = await runCommunityMapImport();
              if ("error" in res && res.error) setMessage(res.error);
              else if ("result" in res && res.result) {
                const r = res.result;
                setMessage(
                  `${r.created} new places · ${r.updated} notes updated · ${r.linked} root beers matched` +
                    (r.goneFromSource ? ` · ${r.goneFromSource} no longer on their map (kept)` : "") +
                    (r.dismissed ? ` · ${r.dismissed} deleted by admins (not re-added)` : "") +
                    ". Club-added places untouched.",
                );
              }
              return;
            }
            const res = source === "openfoodfacts" ? await runOpenFoodFactsImport() : await runRootBeerBarrelImport();
            if ("error" in res && res.error) setMessage(res.error);
            else if ("result" in res && res.result) {
              const r = res.result;
              setMessage(`${r.created} added · ${r.updated} updated${r.barcodes ? ` · ${r.barcodes} barcodes` : ""} · ${r.skipped} skipped (not root beers)`);
            }
          })
        }
      >
        {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Syncing…</> : count ? "Sync now" : "Import"}
      </button>}
    </div>
  );
}

export function PrivacyCard({ shareRatings }: { shareRatings: boolean }) {
  const [on, setOn] = useState(shareRatings);
  const [pending, start] = useTransition();
  return (
    <section className="card p-5">
      <h2 className="font-display text-xl font-semibold text-brew-dark">Privacy</h2>
      <label className="mt-3 flex cursor-pointer items-start justify-between gap-4">
        <span>
          <span className="block font-medium text-ink">Show my name with my ratings</span>
          <span className="mt-0.5 block text-sm text-stone-500">
            {on
              ? "Other members see your name, notes and photos next to your ratings on each root beer."
              : "Your ratings appear as \u201cClub member\u201d, and your notes, photos and entries stay private."}{" "}
            Either way, your ratings count toward each root beer&apos;s average.
          </span>
        </span>
        <Switch
          label="Show my name with my ratings"
          checked={on}
          onChange={(next) => {
            setOn(next);
            start(async () => {
              await setShareRatings(next);
            });
          }}
        />
      </label>
      {pending && <p className="mt-2 text-xs text-stone-400">Saving…</p>}
    </section>
  );
}
