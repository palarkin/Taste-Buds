import { NextResponse } from "next/server";
import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/session";
import { kindOf, putFile } from "@/lib/storage";

// Local upload endpoint. Handoff: replace with Vercel Blob client uploads (handleUpload),
// inserting the media row in onUploadCompleted.
export async function POST(request: Request) {
  if (process.env.VERCEL) {
    return NextResponse.json({ error: "Photo storage isn't connected. An admin needs to connect a Vercel Blob store to this project." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const form = await request.formData();
  const tastingId = String(form.get("tastingId") ?? "");
  const file = form.get("file");
  const takenAtRaw = form.get("takenAt");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });

  const [tasting] = await db
    .select({ id: schema.tastings.id })
    .from(schema.tastings)
    .where(and(eq(schema.tastings.id, tastingId), eq(schema.tastings.userId, user.id)));
  if (!tasting) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  const kind = kindOf(file.type);
  if (!kind) return NextResponse.json({ error: `Unsupported file type ${file.type}` }, { status: 415 });

  try {
    const stored = await putFile(file);
    const [{ top }] = await db
      .select({ top: max(schema.media.sortOrder) })
      .from(schema.media)
      .where(eq(schema.media.tastingId, tastingId));
    const takenAt = typeof takenAtRaw === "string" && takenAtRaw ? new Date(takenAtRaw) : null;
    const [row] = await db
      .insert(schema.media)
      .values({
        tastingId,
        url: stored.url,
        kind,
        mime: stored.mime,
        bytes: stored.bytes,
        takenAt: takenAt && !Number.isNaN(takenAt.getTime()) ? takenAt : null,
        sortOrder: (top ?? -1) + 1,
      })
      .returning();
    revalidatePath("/", "layout");
    return NextResponse.json({ media: row });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
