import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { placeDuplicates, rootBeerDuplicates } from "@/lib/duplicates";
import { EmptyState, PageHeader } from "@/components/ui";
import { Tabs } from "@/components/tabs";
import { PlacePairs, RootBeerPairs } from "./client";

export const metadata = { title: "Review duplicates" };

export default async function DuplicatesPage() {
  const user = await requireUser();
  const back = (
    <Link href="/settings" className="btn-ghost py-2">
      <ChevronLeft className="h-4 w-4" /> Settings
    </Link>
  );
  if (!user.isAdmin) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader title="Review duplicates" action={back} />
        <EmptyState title="Admins only">Ask an admin if you spot a place or root beer that&apos;s listed twice.</EmptyState>
      </div>
    );
  }
  const [places, rootBeers] = await Promise.all([placeDuplicates(), rootBeerDuplicates()]);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Review duplicates"
        subtitle="Possible doubles, closest matches first. Merging keeps one entry and moves everything from the other onto it: ratings, photos, stock reports and links. Syncs won't bring the merged one back."
        action={back}
      />
      <Tabs
        tabs={[
          { id: "places", label: "Places", count: places.length, content: <PlacePairs pairs={places} /> },
          { id: "rootbeers", label: "Root beers", count: rootBeers.length, content: <RootBeerPairs pairs={rootBeers} /> },
        ]}
      />
    </div>
  );
}
