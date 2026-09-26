import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/session";
import { LIMITS } from "@/lib/storage";

// Issues short-lived tokens so the browser can upload photos/videos straight to Vercel Blob
// (Vercel functions can't receive request bodies larger than ~4.5 MB). Only the entry's owner gets a token.
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const user = await getCurrentUser();
        if (!user) throw new Error("Not signed in");
        const { tastingId } = JSON.parse(clientPayload ?? "{}") as { tastingId?: string };
        if (!tastingId || !pathname.startsWith(`tastings/${tastingId}/`)) throw new Error("Bad upload path");
        const [own] = await db
          .select({ id: schema.tastings.id })
          .from(schema.tastings)
          .where(and(eq(schema.tastings.id, tastingId), eq(schema.tastings.userId, user.id)));
        if (!own) throw new Error("That entry isn't yours");
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "video/mp4", "video/quicktime", "video/webm"],
          maximumSizeInBytes: LIMITS.video,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
