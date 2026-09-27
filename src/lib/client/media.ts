"use client";

// Browser-side media prep: read the capture date, shrink big photos, upload with progress.
// On Vercel, uploads go straight from the browser to Vercel Blob; locally they go to /api/upload.
import { recordUploadedMedia } from "@/actions/tastings";

export type PreparedFile = { file: File; takenAt: Date | null; previewUrl: string; kind: "image" | "video" };

const MAX_EDGE = 2400;

async function readTakenAt(file: File): Promise<Date | null> {
  try {
    const exifr = (await import("exifr")).default;
    const data = await exifr.parse(file, ["DateTimeOriginal", "CreateDate"]);
    const d = data?.DateTimeOriginal ?? data?.CreateDate;
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}

async function downscale(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file;
  }
}

const TYPE_BY_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

export async function prepareFile(original: File): Promise<PreparedFile> {
  const ext = original.name.split(".").pop()?.toLowerCase() ?? "";
  const file = original.type ? original : new File([original], original.name, { type: TYPE_BY_EXT[ext] ?? "image/jpeg", lastModified: original.lastModified });
  const kind = file.type.startsWith("video/") ? "video" : "image";
  const takenAt = kind === "image" ? await readTakenAt(file) : file.lastModified ? new Date(file.lastModified) : null;
  const ready = kind === "image" ? await downscale(file) : file;
  return { file: ready, takenAt, previewUrl: URL.createObjectURL(ready), kind };
}

export async function uploadMedia(tastingId: string, p: PreparedFile, mode: "blob" | "local", onProgress?: (fraction: number) => void) {
  if (mode === "blob") {
    const { upload } = await import("@vercel/blob/client");
    const ext = p.file.name.split(".").pop()?.toLowerCase() || (p.kind === "video" ? "mp4" : "jpg");
    const blob = await upload(`tastings/${tastingId}/${p.kind}.${ext}`, p.file, {
      access: "public",
      handleUploadUrl: "/api/blob-upload",
      clientPayload: JSON.stringify({ tastingId }),
      contentType: p.file.type,
      multipart: p.file.size > 20 * 1024 * 1024,
      onUploadProgress: ({ percentage }) => onProgress?.(percentage / 100),
    });
    const res = await recordUploadedMedia({ tastingId, url: blob.url, contentType: p.file.type, size: p.file.size, takenAt: p.takenAt?.toISOString() ?? null });
    if (res && "error" in res && res.error) throw new Error(res.error);
    return;
  }
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    form.append("tastingId", tastingId);
    form.append("file", p.file);
    if (p.takenAt) form.append("takenAt", p.takenAt.toISOString());
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let msg = "Upload failed";
        try {
          msg = JSON.parse(xhr.responseText).error ?? msg;
        } catch {}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection"));
    xhr.send(form);
  });
}
