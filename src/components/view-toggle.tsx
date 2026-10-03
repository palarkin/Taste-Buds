"use client";

import { useOptimistic, useTransition } from "react";
import { setViewPref } from "@/actions/prefs";
import { LayoutGrid, List } from "lucide-react";

// Card / list switch shown to the right of the filter button. The choice is remembered per page.
export function ViewToggle({ scope, value }: { scope: "log" | "directory"; value: "cards" | "list" }) {
  const [view, setView] = useOptimistic(value);
  const [, start] = useTransition();

  const choose = (next: "cards" | "list") => {
    if (next === view) return;
    start(async () => {
      setView(next);
      await setViewPref(scope, next);
    });
  };

  const btn = (mode: "cards" | "list", label: string, Icon: typeof List) => (
    <button
      type="button"
      role="radio"
      aria-checked={view === mode}
      aria-label={label}
      title={label}
      onClick={() => choose(mode)}
      className={`flex h-9 w-9 items-center justify-center rounded-full transition ${view === mode ? "bg-brew text-foam shadow-sm" : "text-stone-500 hover:text-brew"}`}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );

  return (
    <div role="radiogroup" aria-label="View" className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full border border-crema bg-white p-1">
      {btn("cards", "Card view", LayoutGrid)}
      {btn("list", "List view", List)}
    </div>
  );
}
