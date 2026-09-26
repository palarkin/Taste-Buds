// Filter definitions shared by server pages (to read values) and the client filter sheet (to edit them).
// Every screen with filters describes them as sections of fields and renders one <FilterButton>.

export type FilterOption = { value: string; label: string };

export type FilterField =
  | { type: "segmented" | "list"; key: string; label?: string; options: FilterOption[]; defaultValue: string }
  | { type: "toggle"; key: string; label: string; hint?: string };

export type FilterSection = { title: string; fields: FilterField[]; footnote?: string };

export type FilterValues = Record<string, string>;

export function fieldDefault(f: FilterField) {
  return f.type === "toggle" ? "" : f.defaultValue;
}

export function filterDefaults(sections: FilterSection[]): FilterValues {
  return Object.fromEntries(sections.flatMap((s) => s.fields.map((f) => [f.key, fieldDefault(f)])));
}

/** Current values from URL search params, falling back to defaults (and ignoring unknown options). */
export function readFilters(sections: FilterSection[], sp: Record<string, string | string[] | undefined>): FilterValues {
  const out: FilterValues = {};
  for (const f of sections.flatMap((s) => s.fields)) {
    const raw = typeof sp[f.key] === "string" ? (sp[f.key] as string) : "";
    if (f.type === "toggle") out[f.key] = raw === "1" ? "1" : "";
    else out[f.key] = f.options.some((o) => o.value === raw) ? raw : f.defaultValue;
  }
  return out;
}

/** Labels of the filters that differ from their defaults, e.g. ["Haven't tried", "Craft"]. */
export function activeFilterLabels(sections: FilterSection[], values: FilterValues): string[] {
  const labels: string[] = [];
  for (const f of sections.flatMap((s) => s.fields)) {
    const v = values[f.key] ?? fieldDefault(f);
    if (v === fieldDefault(f)) continue;
    if (f.type === "toggle") labels.push(f.label);
    else labels.push(f.options.find((o) => o.value === v)?.label ?? v);
  }
  return labels;
}

export const option = (value: string, label: string): FilterOption => ({ value, label });
