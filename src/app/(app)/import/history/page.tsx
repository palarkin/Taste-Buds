import Link from "next/link";
import { requireUser } from "@/lib/session";
import { importHistory } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";
import { UndoButton } from "./undo-button";

export const metadata = { title: "Past imports" };

export default async function ImportHistoryPage() {
  const user = await requireUser();
  const batches = await importHistory(user.id);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Past imports" action={<Link href="/import" className="btn-primary py-2">New import</Link>} />
      {batches.length === 0 ? (
        <EmptyState title="No imports yet" action={<Link href="/import" className="btn-primary">Import a spreadsheet</Link>} />
      ) : (
        <ul className="space-y-2">
          {batches.map((b) => (
            <li key={b.id} className={`card flex flex-wrap items-center gap-3 p-4 ${b.status === "undone" ? "opacity-60" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{b.filename}</p>
                <p className="text-sm text-stone-500">
                  {formatDate(b.createdAt)} · {b.createdCount} added · {b.updatedCount} updated · {b.skippedCount} skipped
                </p>
              </div>
              {b.status === "undone" ? <span className="rounded bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-500">Undone</span> : <UndoButton batchId={b.id} />}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-stone-500">Undo removes entries an import added and restores ratings it overwrote. Root beers it added to the shared catalog stay in the catalog.</p>
    </div>
  );
}
