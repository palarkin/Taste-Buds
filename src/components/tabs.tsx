"use client";

import { useId, useState, type ReactNode } from "react";

// iOS-style segmented tabs. Panels are rendered on the server and passed in; switching is instant.
export function Tabs({ tabs, defaultId }: { tabs: { id: string; label: string; count?: number; content: ReactNode }[]; defaultId?: string }) {
  const [active, setActive] = useState(defaultId ?? tabs[0]?.id);
  const base = useId();
  return (
    <div>
      <div role="tablist" className="flex rounded-[10px] bg-stone-200/70 p-0.5">
        {tabs.map((t) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              id={`${base}-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              onClick={() => setActive(t.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-[8px] px-3 py-1.5 text-sm font-medium transition ${
                selected ? "bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.15)]" : "text-stone-600"
              }`}
            >
              {t.label}
              {t.count != null && <span className={`text-xs tabular-nums ${selected ? "text-stone-500" : "text-stone-400"}`}>{t.count}</span>}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} id={`${base}-panel-${t.id}`} role="tabpanel" aria-labelledby={`${base}-tab-${t.id}`} hidden={t.id !== active}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
