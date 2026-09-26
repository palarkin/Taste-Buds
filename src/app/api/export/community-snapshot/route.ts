import { getCurrentUser } from "@/lib/session";
import { latestSnapshot } from "@/lib/catalog-import";

// The original community map file exactly as last downloaded by a sync (our backup of their data).
export async function GET() {
  if (!(await getCurrentUser())) return new Response("Not signed in", { status: 401 });
  const snap = await latestSnapshot("communitymap");
  if (!snap?.snapshot) return new Response("No saved copy yet. Sync the community map first.", { status: 404 });
  const stamp = snap.startedAt.toISOString().slice(0, 10);
  return new Response(snap.snapshot, {
    headers: {
      "Content-Type": "application/vnd.google-earth.kml+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="community-root-beer-map-${stamp}.kml"`,
    },
  });
}
