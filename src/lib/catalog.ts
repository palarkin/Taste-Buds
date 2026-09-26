import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { searchKey, slugify } from "@/lib/normalize";

const opt = z.string().trim().max(120).optional().transform((v) => v || null);

export const rootBeerInput = z.object({
  brand: z.string().trim().min(1, "Brand is required").max(80),
  name: z.string().trim().max(80).optional().transform((v) => v || "Root Beer"),
  maker: opt,
  style: opt,
  sweetener: opt,
  origin: opt,
  description: z.string().trim().max(2000).optional().transform((v) => v || null),
});

type Executor = Pick<typeof db, "select" | "insert">;

export async function uniqueSlug(base: string, excludeId?: string, exec: Executor = db) {
  const root = slugify(base) || "root-beer";
  let slug = root;
  for (let i = 2; ; i++) {
    const [hit] = await exec.select({ id: schema.rootBeers.id }).from(schema.rootBeers).where(eq(schema.rootBeers.slug, slug));
    if (!hit || hit.id === excludeId) return slug;
    slug = `${root}-${i}`;
  }
}

export async function insertRootBeer(input: z.infer<typeof rootBeerInput>, userId: string, exec: Executor = db) {
  const label = input.name.toLowerCase() === "root beer" ? input.brand : `${input.brand} ${input.name}`;
  const [rb] = await exec
    .insert(schema.rootBeers)
    .values({ ...input, slug: await uniqueSlug(label, undefined, exec), searchKey: searchKey(input.brand, input.name), createdBy: userId })
    .returning();
  return rb;
}

