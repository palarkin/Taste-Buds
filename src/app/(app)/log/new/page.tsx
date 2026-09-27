import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { myLog } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { TastingForm } from "@/components/tasting-form";
import { uploadMode } from "@/lib/storage";

export const metadata = { title: "Log a root beer" };

export default async function NewTastingPage(props: PageProps<"/log/new">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const slug = typeof sp.rootBeer === "string" ? sp.rootBeer : null;
  const [log, preset] = await Promise.all([
    myLog(user.id),
    slug
      ? db.select({ id: schema.rootBeers.id, slug: schema.rootBeers.slug, brand: schema.rootBeers.brand, name: schema.rootBeers.name })
          .from(schema.rootBeers).where(eq(schema.rootBeers.slug, slug)).then((r) => r[0] ?? null)
      : null,
  ]);
  const alreadyLogged = Object.fromEntries(log.map((e) => [e.root_beer_id, e.id]));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Log a root beer" />
      <TastingForm uploads={uploadMode()} mode="new" presetRootBeer={preset} alreadyLogged={alreadyLogged} />
    </div>
  );
}
