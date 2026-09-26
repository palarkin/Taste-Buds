import "server-only";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Local development: files live in .data/uploads and are served by /api/media/[file].
// On Vercel (BLOB_READ_WRITE_TOKEN set), browsers upload straight to Vercel Blob instead
// (see /api/blob-upload and lib/client/media.ts); deleteFile handles both.

export const UPLOAD_DIR = path.join(process.cwd(), ".data", "uploads");

// Videos are capped so a few long clips can't fill the free 1 GB Blob allowance.
export const LIMITS = {
  image: 15 * 1024 * 1024,
  video: 50 * 1024 * 1024,
};

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export function kindOf(mime: string): "image" | "video" | null {
  if (!(mime in EXT)) return null;
  return mime.startsWith("video/") ? "video" : "image";
}

export async function putFile(file: File): Promise<{ url: string; bytes: number; mime: string }> {
  const kind = kindOf(file.type);
  if (!kind) throw new Error(`Unsupported file type: ${file.type || "unknown"}`);
  if (file.size > LIMITS[kind]) throw new Error(`${kind === "video" ? "Video" : "Image"} is too large`);
  await mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${randomUUID()}.${EXT[file.type]}`;
  await writeFile(path.join(UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));
  return { url: `/api/media/${name}`, bytes: file.size, mime: file.type };
}

export async function deleteFile(url: string) {
  if (/^https:\/\/[^/]+\.blob\.vercel-storage\.com\//.test(url)) {
    const { del } = await import("@vercel/blob");
    await del(url).catch(() => {});
    return;
  }
  const name = url.split("/").pop();
  if (!name || name.includes("..")) return;
  await unlink(path.join(UPLOAD_DIR, name)).catch(() => {});
}

export const MIME_BY_EXT = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));
