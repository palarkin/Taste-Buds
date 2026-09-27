import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getTasting } from "@/lib/queries";
import { displayName } from "@/lib/normalize";
import { PageHeader } from "@/components/ui";
import { TastingForm } from "@/components/tasting-form";
import { uploadMode } from "@/lib/storage";

export const metadata = { title: "Edit entry" };

export default async function EditTastingPage(props: PageProps<"/log/[id]/edit">) {
  const user = await requireUser();
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await getTasting(id);
  if (!t) notFound();
  if (t.tasting.userId !== user.id) redirect(`/log/${id}`);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`Edit: ${displayName(t.rootBeer)}`} />
      <TastingForm
        uploads={uploadMode()}
        mode="edit"
        tastingId={t.tasting.id}
        initial={{
          rootBeer: { id: t.rootBeer.id, slug: t.rootBeer.slug, brand: t.rootBeer.brand, name: t.rootBeer.name },
          rating: t.tasting.rating,
          notes: t.tasting.notes,
          tastedOn: t.tasting.tastedOn,
          purchasedOn: t.tasting.purchasedOn,
          priceCents: t.tasting.priceCents,
          location: t.location ? { id: t.location.id, name: t.location.name, address: t.location.address, category: t.location.category } : null,
          purchasedFrom: t.tasting.purchasedFrom,
        }}
        existingMedia={t.media.map((m) => ({ id: m.id, url: m.url, kind: m.kind }))}
      />
    </div>
  );
}
