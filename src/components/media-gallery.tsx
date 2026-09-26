"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";

// Grid of a member's own photos/videos on a log entry. Tapping one opens a full-screen viewer
// (swipe or arrow keys to move, Esc to close; videos play inline).

type Item = { id: string; url: string; kind: "image" | "video" };

export function MediaGallery({ items, title }: { items: Item[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!items.length) return null;
  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((m, i) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="group relative block aspect-square w-full overflow-hidden rounded-xl bg-stone-100 ring-1 ring-crema"
              aria-label={`Open ${m.kind === "video" ? "video" : "photo"} ${i + 1} of ${items.length}`}
            >
              {m.kind === "video" ? (
                <>
                  <video src={`${m.url}#t=0.1`} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <span className="rounded-full bg-white/90 p-2 shadow"><Play className="h-4 w-4 fill-ink text-ink" /></span>
                  </span>
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
              )}
            </button>
          </li>
        ))}
      </ul>
      {open !== null && <Lightbox items={items} start={open} title={title} onClose={() => setOpen(null)} />}
    </>
  );
}

function Lightbox({ items, start, title, onClose }: { items: Item[]; start: number; title: string; onClose: () => void }) {
  const [i, setI] = useState(start);
  const touchX = useRef<number | null>(null);
  const go = useCallback((d: number) => setI((x) => (x + d + items.length) % items.length), [items.length]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [go, onClose]);

  const m = items[i];
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex animate-fade-in flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} photos`}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <span className="text-sm text-white/70">{i + 1} of {items.length}</span>
        <button type="button" onClick={onClose} className="rounded-full bg-white/15 p-2 hover:bg-white/25" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-2 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {m.kind === "video" ? (
          <video key={m.id} src={m.url} controls autoPlay playsInline className="max-h-full max-w-full rounded-lg" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={m.id} src={m.url} alt={`${title}, photo ${i + 1}`} className="max-h-full max-w-full rounded-lg object-contain" />
        )}
        {items.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/15 p-2.5 text-white hover:bg-white/25 sm:block" aria-label="Previous">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button type="button" onClick={() => go(1)} className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/15 p-2.5 text-white hover:bg-white/25 sm:block" aria-label="Next">
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
