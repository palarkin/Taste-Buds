import Link from "next/link";
import { History } from "lucide-react";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { ImportWizard } from "./wizard";

export const metadata = { title: "Import a spreadsheet" };

export default async function ImportPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Import a spreadsheet"
        subtitle="Bring your existing root beer list into your log. Import as many files as you like, whenever you like."
        action={<Link href="/import/history" className="btn-ghost py-2"><History className="h-4 w-4" /> Past imports</Link>}
      />
      <ImportWizard />
    </div>
  );
}
