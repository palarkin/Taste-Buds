import { requireUser } from "@/lib/session";
import { mapLocations } from "@/lib/queries";
import { MapExplorer } from "./map-explorer";

export const metadata = { title: "Map" };

export default async function MapPage(props: PageProps<"/map">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const locations = await mapLocations(user.id);
  return <MapExplorer locations={locations} initialSelectedId={typeof sp.loc === "string" ? sp.loc : null} isAdmin={user.isAdmin} />;
}
