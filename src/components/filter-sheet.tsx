"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, SlidersHorizontal } from "lucide-react";
import { activeFilterLabels, fieldDefault, filterDefaults, type FilterSection, type FilterValues } from "@/lib/filters";

// One filter experience for the whole app: a single icon button that opens a sheet
// (bottom sheet on phones, centered card on larger screens) with grouped, iOS-style controls.

export function FilterIconButton({ count, onClick, label = "Filters" }: { count: number; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count ? `${label} (${count} active)` : label}
      className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition active:scale-95 ${
        count ? "border-brew bg-brew text-foam" : "border-crema bg-white text-brew hover:bg-cream"
      }`}
    >
      <SlidersHorizontal className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-sassafras px-1 text-[11px] font-bold text-white ring-2 ring-foam">
          {count}
        </span>
      )}
    </button>
  );
}

export function FilterSheet({
  open,
  onClose,
  sections,
  values,
  onApply,
  title = "Filters",
}: {
  open: boolean;
  onClose: () => void;
  sections: FilterSection[];
  values: FilterValues;
  onApply: (values: FilterValues) => void;
  title?: string;
}) {
  const [draft, setDraft] = useState(values);
  const [prevOpen, setPrevOpen] = useState(open);
  const doneRef = useRef<HTMLButtonElement>(null);

  // Start each opening from the currently applied values.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setDraft(values);
  }

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    doneRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const defaults = filterDefaults(sections);
  const isDefault = Object.keys(defaults).every((k) => (draft[k] ?? defaults[k]) === defaults[k]);
  const set = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-black/35 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[88dvh] w-full animate-sheet-in flex-col overflow-hidden rounded-t-[28px] bg-[#f4efe8] shadow-2xl sm:max-w-md sm:animate-pop-in sm:rounded-[28px]"
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-stone-300 sm:hidden" aria-hidden />
        <header className="grid grid-cols-[1fr_auto_1fr] items-center px-4 pb-2 pt-3">
          <button type="button" onClick={onClose} className="justify-self-start rounded-lg px-1 py-1 text-[15px] text-brew">
            Cancel
          </button>
          <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
          <button
            ref={doneRef}
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className="justify-self-end rounded-lg px-1 py-1 text-[15px] font-semibold text-sassafras-dark"
          >
            Done
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
          {sections.map((section) => (
            <section key={section.title}>
              <h3 className="mb-1.5 px-4 text-[13px] font-medium uppercase tracking-wide text-stone-500">{section.title}</h3>
              <div className="overflow-hidden rounded-2xl bg-white">
                {section.fields.map((f, i) => (
                  <div key={f.key} className={i > 0 ? "border-t border-stone-200/80" : ""}>
                    {f.type === "segmented" && (
                      <div className="p-2">
                        {f.label && <p className="px-2 pb-2 pt-1 text-[15px] text-ink">{f.label}</p>}
                        <Segmented value={draft[f.key] ?? f.defaultValue} options={f.options} onChange={(v) => set(f.key, v)} label={f.label ?? section.title} />
                      </div>
                    )}
                    {f.type === "list" && (
                      <div role="radiogroup" aria-label={f.label ?? section.title}>
                        {f.options.map((o, j) => {
                          const selected = (draft[f.key] ?? f.defaultValue) === o.value;
                          return (
                            <button
                              key={o.value}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() => set(f.key, o.value)}
                              className={`flex w-full items-center justify-between px-4 py-3 text-left text-[15px] text-ink active:bg-stone-100 ${j > 0 ? "border-t border-stone-200/80" : ""}`}
                            >
                              {o.label}
                              {selected && <Check className="h-5 w-5 text-sassafras-dark" strokeWidth={2.5} />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {f.type === "toggle" && (
                      <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
                        <span>
                          <span className="block text-[15px] text-ink">{f.label}</span>
                          {f.hint && <span className="block text-[13px] text-stone-500">{f.hint}</span>}
                        </span>
                        <Switch checked={draft[f.key] === "1"} onChange={(on) => set(f.key, on ? "1" : "")} label={f.label} />
                      </label>
                    )}
                  </div>
                ))}
              </div>
              {section.footnote && <p className="mt-1.5 px-4 text-[13px] text-stone-500">{section.footnote}</p>}
            </section>
          ))}

          <button
            type="button"
            disabled={isDefault}
            onClick={() => setDraft(defaults)}
            className="w-full rounded-2xl bg-white py-3 text-[15px] font-medium text-red-600 transition disabled:text-stone-300"
          >
            Reset all
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Icon button + sheet, for screens that keep filter state in the component. */
export function FilterButton({
  sections,
  values,
  onApply,
  title,
}: {
  sections: FilterSection[];
  values: FilterValues;
  onApply: (values: FilterValues) => void;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <FilterIconButton count={activeFilterLabels(sections, values).length} onClick={() => setOpen(true)} />
      <FilterSheet open={open} onClose={() => setOpen(false)} sections={sections} values={values} onApply={onApply} title={title} />
    </>
  );
}

/** Icon button + sheet that stores filters in the URL (server-rendered list pages). */
export function UrlFilterButton({ sections, values, title }: { sections: FilterSection[]; values: FilterValues; title?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <FilterButton
      sections={sections}
      values={values}
      title={title}
      onApply={(next) => {
        const qs = new URLSearchParams(params.toString());
        qs.delete("limit"); // new filters start from the first page
        for (const f of sections.flatMap((s) => s.fields)) {
          const v = next[f.key] ?? "";
          if (v === fieldDefault(f)) qs.delete(f.key);
          else qs.set(f.key, v);
        }
        const s = qs.toString();
        router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
      }}
    />
  );
}

export function Segmented({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-[10px] bg-stone-200/70 p-0.5">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-[8px] px-2 py-1.5 text-[13px] font-medium transition ${
              selected ? "bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.15)]" : "text-stone-600"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        onChange(!checked);
      }}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${checked ? "bg-emerald-500" : "bg-stone-300"}`}
    >
      <span className={`absolute left-0.5 top-0.5 h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}

/** "12 shown · Haven't tried · Craft   Clear" line under a list. */
export function FilterSummary({ count, labels, clearHref }: { count: number; labels: string[]; clearHref: string }) {
  return (
    <p className="mb-3 flex flex-wrap items-center gap-x-2 text-sm text-stone-500">
      <span>{count} shown</span>
      {labels.map((l) => (
        <span key={l} className="before:mr-2 before:content-['·']">{l}</span>
      ))}
      {labels.length > 0 && (
        <a href={clearHref} className="ml-1 font-medium text-sassafras-dark">Clear</a>
      )}
    </p>
  );
}
