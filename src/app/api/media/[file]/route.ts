import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getCurrentUser } from "@/lib/session";
import { MIME_BY_EXT, UPLOAD_DIR } from "@/lib/storage";

// Serves locally stored uploads, with Range support so video scrubs (Safari requires it).
export async function GET(request: Request, ctx: RouteContext<"/api/media/[file]">) {
  if (!(await getCurrentUser())) return new Response("Not signed in", { status: 401 });
  const { file } = await ctx.params;
  if (!/^[0-9a-f-]+\.[a-z0-9]+$/i.test(file)) return new Response("Not found", { status: 404 });

  const full = path.join(UPLOAD_DIR, file);
  const info = await stat(full).catch(() => null);
  if (!info) return new Response("Not found", { status: 404 });

  const type = MIME_BY_EXT[file.split(".").pop()!.toLowerCase()] ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
  };

  const range = request.headers.get("range");
  const match = range?.match(/bytes=(\d*)-(\d*)/);
  if (match) {
    const start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
    if (start >= info.size || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
    }
    const stream = Readable.toWeb(createReadStream(full, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${info.size}`, "Content-Length": String(end - start + 1) },
    });
  }

  const stream = Readable.toWeb(createReadStream(full)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(info.size) } });
}
