"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// App-wide confirmation pop-up (replaces the browser's confirm()).
// Usage: const [confirm, confirmDialog] = useConfirm();  …  if (await confirm({ title, message })) doIt();  …  render {confirmDialog}

type Options = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export function useConfirm(): [(o: Options) => Promise<boolean>, ReactNode] {
  const [state, setState] = useState<(Options & { resolve: (ok: boolean) => void }) | null>(null);

  const confirm = useCallback((o: Options) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = useCallback(
    (ok: boolean) => {
      state?.resolve(ok);
      setState(null);
    },
    [state],
  );

  return [confirm, state ? <ConfirmDialog key="confirm" {...state} onClose={close} /> : null];
}

function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  onClose,
}: Options & { onClose: (ok: boolean) => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus(); // safe default: Enter cancels
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[2px]" onClick={() => onClose(false)} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={message ? "confirm-message" : undefined}
        className="relative w-full max-w-[300px] animate-pop-in overflow-hidden rounded-[22px] bg-[#f7f3ee]/95 text-center shadow-2xl backdrop-blur"
      >
        <div className="px-5 pb-4 pt-5">
          <h2 id="confirm-title" className="text-[17px] font-semibold text-ink">{title}</h2>
          {message && <div id="confirm-message" className="mt-1.5 text-[13px] leading-snug text-stone-600">{message}</div>}
        </div>
        <div className="grid grid-cols-2 border-t border-stone-300/70">
          <button ref={cancelRef} type="button" onClick={() => onClose(false)} className="py-3 text-[17px] text-sassafras-dark outline-none focus-visible:bg-stone-200/70 active:bg-stone-200/70">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onClose(true)}
            className={`border-l border-stone-300/70 py-3 text-[17px] font-semibold outline-none focus-visible:bg-stone-200/70 active:bg-stone-200/70 ${destructive ? "text-red-600" : "text-sassafras-dark"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
