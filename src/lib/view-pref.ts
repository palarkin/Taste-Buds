import "server-only";
import { cookies } from "next/headers";

export type ViewMode = "cards" | "list";
export type ViewScope = "log" | "directory";

/** Card or list view, remembered per page in a cookie (set by <ViewToggle>). */
export async function getViewPref(scope: ViewScope): Promise<ViewMode> {
  const v = (await cookies()).get(`tb_view_${scope}`)?.value;
  return v === "list" ? "list" : "cards";
}
