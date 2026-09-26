"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, ScanBarcode, X } from "lucide-react";
import { scanBarcode } from "@/actions/catalog-sources";
import type { PickedRootBeer } from "./root-beer-picker";

// Full-screen camera sheet that reads a UPC/EAN barcode, then looks it up:
// club catalog first, then Open Food Facts. Unknown codes are handed back so the member can link or add them.

type Outcome =
  | { status: "found"; rootBeer: PickedRootBeer; source: "club" | "openfoodfacts" }
  | { status: "unknown"; barcode: string; suggestion: { brand: string; name: string } | null };

export function BarcodeScanner({ open, onClose, onResult }: { open: boolean; onClose: () => void; onResult: (o: Outcome) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<"camera" | "looking" | "error">("camera");
  const [message, setMessage] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const busy = useRef(false);

  async function lookup(code: string) {
    if (busy.current) return;
    busy.current = true;
    setPhase("looking");
    try {
      const res = await scanBarcode(code);
      if (res.status === "invalid") {
        setMessage("That doesn't look like a product barcode. Try again.");
        setPhase("camera");
        busy.current = false;
        return;
      }
      onResult(res as Outcome);
      onClose();
    } catch {
      setMessage("Couldn't look that up. Check your connection and try again.");
      setPhase("camera");
      busy.current = false;
    }
  }

  useEffect(() => {
    if (!open) return;
    busy.current = false;
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase("error");
        setMessage(
          window.isSecureContext
            ? "This browser can't use the camera. Type the number under the barcode instead."
            : "The camera only works on a secure (https) connection. Type the number under the barcode instead.",
        );
        return;
      }
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8]);
        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } },
          videoRef.current!,
          (result) => {
            if (result && !busy.current) {
              navigator.vibrate?.(40);
              lookup(result.getText());
            }
          },
        );
        if (cancelled) controls.stop();
        else stop = () => controls.stop();
      } catch (e) {
        if (cancelled) return;
        setPhase("error");
        setMessage(
          (e as Error).name === "NotAllowedError"
            ? "Camera access was blocked. Allow it in your browser settings, or type the number instead."
            : "Couldn't start the camera. Type the number under the barcode instead.",
        );
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Scan a barcode">
      <div className="flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <button type="button" onClick={onClose} className="rounded-full bg-white/15 p-2" aria-label="Close scanner">
          <X className="h-5 w-5" />
        </button>
        <p className="text-[15px] font-semibold">Scan barcode</p>
        <span className="w-9" />
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-40 w-[78%] max-w-sm rounded-3xl border-[3px] border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
        <p className="absolute inset-x-0 top-6 text-center text-sm font-medium text-white/90">
          {phase === "looking" ? (
            <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Looking it up…</span>
          ) : (
            "Point at the barcode on the bottle or can"
          )}
        </p>
        {message && <p className="absolute inset-x-4 bottom-6 rounded-2xl bg-black/70 px-4 py-3 text-center text-sm text-white">{message}</p>}
        {phase === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-stone-900">
            <ScanBarcode className="h-16 w-16 text-white/30" />
          </div>
        )}
      </div>

      <form
        className="flex gap-2 bg-black px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) lookup(typed);
        }}
      >
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          inputMode="numeric"
          placeholder="Or type the number under the barcode"
          aria-label="Barcode number"
          className="h-12 flex-1 rounded-full bg-white/15 px-4 text-[15px] text-white placeholder:text-white/50 outline-none focus:bg-white/20"
        />
        <button className="h-12 rounded-full bg-white px-5 text-[15px] font-semibold text-black disabled:opacity-40" disabled={!typed.trim() || phase === "looking"}>
          Look up
        </button>
      </form>
    </div>,
    document.body,
  );
}
