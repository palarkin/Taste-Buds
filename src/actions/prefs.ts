"use server";

import { cookies } from "next/headers";

/** Remember card vs list view per page. Setting a cookie in an action re-renders the page with the new view. */
export async function setViewPref(scope: "log" | "directory", view: "cards" | "list") {
  if (!["log", "directory"].includes(scope) || !["cards", "list"].includes(view)) return;
  (await cookies()).set(`tb_view_${scope}`, view, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
