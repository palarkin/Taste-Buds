"use client";

import { useConfirm } from "@/components/confirm-dialog";
import { useTransition } from "react";
import { undoImport } from "@/actions/import";

export function UndoButton({ batchId }: { batchId: string }) {
  const [pending, start] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  return (
    <>
    <button
      className="btn-danger py-2"
      disabled={pending}
      onClick={async () => {
        const ok = await confirm({
          title: "Undo this import?",
          message: "Entries it added will be removed and any ratings it changed will be restored.",
          confirmLabel: "Undo",
        });
        if (ok) start(async () => { await undoImport(batchId); });
      }}
    >
      {pending ? "Undoing…" : "Undo import"}
    </button>
    {confirmDialog}
    </>
  );
}
