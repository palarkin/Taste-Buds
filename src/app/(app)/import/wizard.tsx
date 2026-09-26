"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import {
  buildRows,
  detectColumns,
  detectScale,
  FIELD_LABELS,
  findHeaderRow,
  isFraction,
  labelKey,
  parseRatingCell,
  type Field,
  type Mapping,
  type ParsedRow,
  type Scale,
} from "@/lib/import/parse";
import { commitImport, getMyRatings, matchLabels, type MatchResult } from "@/actions/import";
import { formatRating } from "@/lib/format";
import { Segmented, Switch } from "@/components/filter-sheet";
import { displayName } from "@/lib/normalize";

type Sheet = { name: string; data: unknown[][] };
type Step = "upload" | "map" | "match" | "review" | "done";
type Decision = { kind: "existing"; id: string } | { kind: "new" } | { kind: "skip" };
type Group = { key: string; brand: string; name: string; count: number; sample: string };

const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "map", label: "Columns" },
  { id: "match", label: "Match" },
  { id: "review", label: "Review" },
];

export function ImportWizard() {
  const [step, setStep] = useState<Step>("upload");
  const [filename, setFilename] = useState("");
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const [scale, setScale] = useState<Scale>(10);
  const [extraCols, setExtraCols] = useState<number[]>([]);
  const [matches, setMatches] = useState<Record<string, MatchResult>>({});
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});
  const [conflictPolicy, setConflictPolicy] = useState<"keep" | "overwrite">("keep");
  const [overrides, setOverrides] = useState<Record<string, "keep" | "overwrite">>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; newRootBeers: number } | null>(null);
  const [matchFilter, setMatchFilter] = useState<"review" | "all">("review");

  const sheet = sheets[sheetIdx];
  const headers = useMemo(() => (sheet?.data[headerRow] ?? []).map((h) => String(h ?? "").trim()), [sheet, headerRow]);
  const rows: ParsedRow[] = useMemo(
    () => (sheet ? buildRows(sheet.data, headerRow, mapping, scale, extraCols, headers) : []),
    [sheet, headerRow, mapping, scale, extraCols, headers],
  );
  const groups: Group[] = useMemo(() => {
    const m = new Map<string, Group>();
    for (const r of rows) {
      if (!r.brand || r.rating == null) continue;
      const key = labelKey(r.brand, r.name);
      const g = m.get(key);
      if (g) g.count++;
      else m.set(key, { key, brand: r.brand, name: r.name, count: 1, sample: r.label });
    }
    return [...m.values()];
  }, [rows]);

  function configureSheet(s: Sheet) {
    const h = findHeaderRow(s.data);
    setHeaderRow(h);
    const hdrs = (s.data[h] ?? []).map((x) => String(x ?? ""));
    const map = detectColumns(hdrs);
    setMapping(map);
    const ratingCol = map.rating;
    if (ratingCol != null) {
      const raw = s.data.slice(h + 1).map((r) => r?.[ratingCol]);
      setScale(detectScale(raw.filter((v) => !isFraction(v)).map(parseRatingCell)));
    } else setScale(10);
    setExtraCols([]);
  }

  async function onFile(file: File) {
    setError(null);
    setBusy("Reading file…");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const parsed = wb.SheetNames.map((name) => ({
        name,
        data: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false }),
      })).filter((s) => s.data.length > 1);
      if (!parsed.length) throw new Error("That file doesn't seem to have any rows.");
      setFilename(file.name);
      setSheets(parsed);
      setSheetIdx(0);
      configureSheet(parsed[0]);
      setStep("map");
    } catch (e) {
      setError((e as Error).message || "Couldn't read that file. Try saving it as .xlsx or .csv.");
    } finally {
      setBusy(null);
    }
  }

  async function runMatching() {
    setError(null);
    setBusy(`Matching ${groups.length} root beers against the catalog…`);
    try {
      const [res, mine] = await Promise.all([matchLabels(groups.map((g) => ({ key: g.key, brand: g.brand, name: g.name }))), getMyRatings()]);
      const byKey = Object.fromEntries(res.map((r) => [r.key, r]));
      setMatches(byKey);
      setMyRatings(mine);
      setDecisions(
        Object.fromEntries(
          res.map((r) => [r.key, r.suggestion.kind === "new" ? { kind: "new" } : { kind: "existing", id: r.suggestion.id }] as const),
        ),
      );
      setMatchFilter(res.some((r) => r.suggestion.kind !== "match") ? "review" : "all");
      setStep("match");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Final row list with target + conflict status.
  const plan = useMemo(() => {
    return rows.map((r) => {
      const key = r.brand ? labelKey(r.brand, r.name) : "";
      const d = decisions[key];
      if (!r.brand || r.rating == null || !d || d.kind === "skip") return { r, key, status: "skip" as const, existing: null as number | null };
      if (d.kind === "new") return { r, key, status: "new" as const, existing: null };
      const existing = myRatings[d.id];
      if (existing == null) return { r, key, status: "new" as const, existing: null };
      if (existing === r.rating) return { r, key, status: "same" as const, existing };
      return { r, key, status: "conflict" as const, existing };
    });
  }, [rows, decisions, myRatings]);

  const counts = {
    new: plan.filter((p) => p.status === "new").length,
    conflict: plan.filter((p) => p.status === "conflict").length,
    same: plan.filter((p) => p.status === "same").length,
    skip: plan.filter((p) => p.status === "skip").length,
  };

  async function commit() {
    setError(null);
    setBusy("Importing…");
    try {
      const payload = plan
        .filter((p) => p.status !== "skip")
        .map((p) => {
          const d = decisions[p.key] as Exclude<Decision, { kind: "skip" }>;
          return {
            target: d.kind === "existing" ? { id: d.id } : { newKey: p.key, brand: p.r.brand, name: p.r.name },
            rating: p.r.rating!,
            notes: p.r.notes,
            tastedOn: p.r.tastedOn,
            where: p.r.where,
            onConflict: overrides[p.key] ?? conflictPolicy,
          };
        });
      const res = await commitImport({ filename, rows: payload });
      if ("error" in res && res.error) throw new Error(res.error);
      setResult(res as NonNullable<typeof result>);
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const stepIdx = STEPS.findIndex((s) => s.id === step);
  const hasName = mapping.rootBeer != null || mapping.brand != null;

  return (
    <div className="space-y-4">
      {step !== "done" && (
        <ol className="flex gap-2 text-sm">
          {STEPS.map((s, i) => (
            <li key={s.id} className={`flex flex-1 items-center gap-2 rounded-xl px-3 py-2 ${i === stepIdx ? "bg-brew text-foam" : i < stepIdx ? "bg-cream text-brew" : "bg-white text-stone-400 ring-1 ring-crema"}`}>
              <span className="font-semibold">{i + 1}</span> <span className="hidden sm:inline">{s.label}</span>
            </li>
          ))}
        </ol>
      )}

      {error && <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert"><AlertTriangle className="h-4 w-4" /> {error}</p>}
      {busy && <p className="flex items-center gap-2 rounded-xl bg-cream px-3 py-2 text-sm text-brew"><Loader2 className="h-4 w-4 animate-spin" /> {busy}</p>}

      {step === "upload" && (
        <label
          className="card flex cursor-pointer flex-col items-center border-2 border-dashed border-crema px-6 py-16 text-center transition hover:border-sassafras"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
        >
          <FileSpreadsheet className="mb-3 h-12 w-12 text-sassafras" />
          <p className="font-display text-xl font-semibold text-brew-dark">Drop your spreadsheet here</p>
          <p className="mt-1 text-sm text-stone-600">or tap to choose a file: Excel (.xlsx, .xls), CSV, or Numbers/Google Sheets exported as either</p>
          <span className="btn-primary mt-5"><Upload className="h-4 w-4" /> Choose file</span>
          <input type="file" accept=".xlsx,.xls,.csv,.ods,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <p className="mt-5 max-w-md text-xs text-stone-500">The file is read in your browser. Only the rows you approve get saved.</p>
        </label>
      )}

      {step === "map" && sheet && (
        <div className="card space-y-5 p-5">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <p className="label">File</p>
              <p className="font-semibold">{filename}</p>
            </div>
            {sheets.length > 1 && (
              <div>
                <label className="label" htmlFor="sheet">Sheet</label>
                <select id="sheet" className="input" value={sheetIdx} onChange={(e) => { const i = Number(e.target.value); setSheetIdx(i); configureSheet(sheets[i]); }}>
                  {sheets.map((s, i) => <option key={s.name} value={i}>{s.name} ({s.data.length - 1} rows)</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label" htmlFor="hdr">Header row</label>
              <select id="hdr" className="input" value={headerRow} onChange={(e) => { setHeaderRow(Number(e.target.value)); setMapping(detectColumns((sheet.data[Number(e.target.value)] ?? []).map((x) => String(x ?? "")))); }}>
                {sheet.data.slice(0, 10).map((r, i) => <option key={i} value={i}>Row {i + 1}: {(r ?? []).filter(Boolean).slice(0, 3).join(", ").slice(0, 40)}</option>)}
              </select>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-brew-dark">Which column is which?</h3>
            <p className="text-sm text-stone-500">We guessed from your headers. Fix anything that&apos;s wrong.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(Object.keys(FIELD_LABELS) as Field[]).map((f) => (
                <div key={f}>
                  <label className="label" htmlFor={`map-${f}`}>{FIELD_LABELS[f]}</label>
                  <select
                    id={`map-${f}`}
                    className="input"
                    value={mapping[f] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? undefined : Number(e.target.value);
                      const next = { ...mapping };
                      if (v === undefined) delete next[f];
                      else next[f] = v;
                      setMapping(next);
                    }}
                  >
                    <option value="">Not in this file</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {mapping.rootBeer != null && mapping.brand != null && (
              <p className="mt-2 text-xs text-amber-700">You picked both a combined root beer column and a brand column. The brand column wins.</p>
            )}
          </div>

          {mapping.rating != null && (
            <div>
              <h3 className="font-semibold text-brew-dark">Rating scale</h3>
              <p className="text-sm text-stone-500">Taste Buds uses 0–10. Values like &ldquo;8/10&rdquo; are converted automatically.</p>
              <div className="mt-2 max-w-sm">
                <Segmented
                  label="Rating scale"
                  value={String(scale)}
                  onChange={(v) => setScale(Number(v) as Scale)}
                  options={[{ value: "5", label: "Out of 5" }, { value: "10", label: "Out of 10" }, { value: "100", label: "Out of 100" }]}
                />
              </div>
            </div>
          )}

          {headers.some((_, i) => !Object.values(mapping).includes(i) && headers[i]) && (
            <div>
              <h3 className="font-semibold text-brew-dark">Other columns</h3>
              <p className="text-sm text-stone-500">Turn on any you want copied into the notes.</p>
              <div className="mt-2 max-w-sm divide-y divide-stone-200/80 overflow-hidden rounded-2xl border border-crema bg-white">
                {headers.map((h, i) =>
                  !Object.values(mapping).includes(i) && h ? (
                    <label key={i} className="flex cursor-pointer items-center justify-between gap-4 px-4 py-2.5">
                      <span className="text-[15px]">{h}</span>
                      <Switch label={`Copy ${h} into notes`} checked={extraCols.includes(i)} onChange={(on) => setExtraCols(on ? [...extraCols, i] : extraCols.filter((c) => c !== i))} />
                    </label>
                  ) : null,
                )}
              </div>
            </div>
          )}

          <div>
            <h3 className="font-semibold text-brew-dark">Preview</h3>
            <div className="mt-2 overflow-x-auto rounded-xl border border-crema">
              <table className="w-full text-sm">
                <thead className="bg-cream/60 text-left text-xs uppercase tracking-wide text-stone-500">
                  <tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Root beer</th><th className="px-3 py-2">Rating</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Notes</th></tr>
                </thead>
                <tbody>
                  {rows.slice(0, 6).map((r) => (
                    <tr key={r.row} className="border-t border-crema/60">
                      <td className="px-3 py-2 text-stone-400">{r.row}</td>
                      <td className="px-3 py-2">{r.brand ? displayName(r) : <span className="text-red-600">missing</span>}</td>
                      <td className="px-3 py-2">{r.rating != null ? formatRating(r.rating) : <span className="text-red-600">{String(r.rawRating ?? "–")}</span>}</td>
                      <td className="px-3 py-2 text-stone-500">{r.tastedOn ?? ""}</td>
                      <td className="max-w-60 truncate px-3 py-2 text-stone-500">{r.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-sm text-stone-500">
              {rows.length} rows · {groups.length} distinct root beers
              {rows.filter((r) => r.problems.length).length > 0 && <span className="text-amber-700"> · {rows.filter((r) => r.problems.length).length} rows have problems and will be skipped</span>}
            </p>
          </div>

          <div className="flex gap-2">
            <button className="btn-primary" disabled={!hasName || mapping.rating == null || !!busy || groups.length === 0} onClick={runMatching}>Next: match root beers</button>
            <button className="btn-ghost" onClick={() => { setStep("upload"); setSheets([]); }}>Choose a different file</button>
          </div>
          {(!hasName || mapping.rating == null) && <p className="text-sm text-amber-700">Pick at least a root beer (or brand) column and a rating column.</p>}
        </div>
      )}

      {step === "match" && (
        <div className="card p-5">
          <h3 className="font-semibold text-brew-dark">Match to the catalog</h3>
          <p className="text-sm text-stone-500">Each root beer in your file is matched to the shared catalog so everyone&apos;s ratings line up. Anything without a match is added as new.</p>
          <label className="mt-3 flex max-w-sm cursor-pointer items-center justify-between gap-4 rounded-2xl border border-crema bg-white px-4 py-2.5">
            <span className="text-[15px]">
              Only ones that need a look
              <span className="ml-1 text-stone-400">({groups.filter((g) => matches[g.key]?.suggestion.kind !== "match").length} of {groups.length})</span>
            </span>
            <Switch label="Only ones that need a look" checked={matchFilter === "review"} onChange={(on) => setMatchFilter(on ? "review" : "all")} />
          </label>
          <ul className="mt-3 divide-y divide-crema/70">
            {groups
              .filter((g) => matchFilter === "all" || matches[g.key]?.suggestion.kind !== "match")
              .map((g) => {
                const m = matches[g.key];
                const d = decisions[g.key];
                const value = d?.kind === "existing" ? d.id : d?.kind ?? "new";
                return (
                  <li key={g.key} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-40 flex-1">
                      <p className="font-medium">{g.sample}</p>
                      <p className="text-xs text-stone-500">
                        {g.count > 1 ? `${g.count} rows · ` : ""}
                        {m?.suggestion.kind === "match" ? <span className="text-emerald-700">Matched</span> : m?.suggestion.kind === "suggest" ? <span className="text-amber-700">Possible match, please check</span> : <span className="text-sky-700">Not in catalog yet</span>}
                      </p>
                    </div>
                    <select
                      className="input max-w-xs"
                      value={value}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDecisions({ ...decisions, [g.key]: v === "new" ? { kind: "new" } : v === "skip" ? { kind: "skip" } : { kind: "existing", id: v } });
                      }}
                    >
                      {m?.candidates.map((c) => <option key={c.id} value={c.id}>= {displayName(c)}</option>)}
                      <option value="new">+ Add &ldquo;{displayName(g)}&rdquo; as new</option>
                      <option value="skip">Skip this one</option>
                    </select>
                  </li>
                );
              })}
          </ul>
          {matchFilter === "review" && groups.every((g) => matches[g.key]?.suggestion.kind === "match") && (
            <p className="py-4 text-sm text-emerald-700">Everything matched confidently. 🎉</p>
          )}
          <div className="mt-4 flex gap-2">
            <button className="btn-primary" onClick={() => setStep("review")}>Next: review</button>
            <button className="btn-ghost" onClick={() => setStep("map")}>Back</button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="card p-5">
          <h3 className="font-semibold text-brew-dark">Ready to import</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Count label="New entries" value={counts.new} tone="emerald" />
            <Count label="Rating differs from your log" value={counts.conflict} tone="amber" />
            <Count label="Already in your log" value={counts.same} tone="stone" />
            <Count label="Skipped" value={counts.skip} tone="stone" />
          </div>

          {counts.conflict > 0 && (
            <div className="mt-5">
              <p className="font-medium">For root beers already in your log with a different rating:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <div className="w-full max-w-sm">
                  <Segmented
                    label="Conflicting ratings"
                    value={conflictPolicy}
                    onChange={(v) => { setConflictPolicy(v as "keep" | "overwrite"); setOverrides({}); }}
                    options={[{ value: "keep", label: "Keep my log" }, { value: "overwrite", label: "Use spreadsheet" }]}
                  />
                </div>
              </div>
              <ul className="mt-3 divide-y divide-crema/70 rounded-xl border border-crema">
                {plan.filter((p) => p.status === "conflict").map((p) => {
                  const choice = overrides[p.key] ?? conflictPolicy;
                  return (
                    <li key={p.r.row} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                      <span className="flex-1 font-medium">{p.r.label}</span>
                      <span className="text-stone-500">log {formatRating(p.existing)} → sheet {formatRating(p.r.rating)}</span>
                      <select className="rounded-lg border border-crema px-2 py-1" value={choice} onChange={(e) => setOverrides({ ...overrides, [p.key]: e.target.value as "keep" | "overwrite" })}>
                        <option value="keep">Keep {formatRating(p.existing)}</option>
                        <option value="overwrite">Use {formatRating(p.r.rating)}</option>
                      </select>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {plan.some((p) => p.status === "skip" && p.r.problems.length) && (
            <details className="mt-5">
              <summary className="cursor-pointer text-sm font-medium text-amber-700">Rows that will be skipped because of problems ({plan.filter((p) => p.status === "skip" && p.r.problems.length).length})</summary>
              <ul className="mt-2 space-y-1 text-sm text-stone-600">
                {plan.filter((p) => p.status === "skip" && p.r.problems.length).map((p) => (
                  <li key={p.r.row}>Row {p.r.row} ({p.r.label}): {p.r.problems.join(", ")}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="mt-5 flex gap-2">
            <button className="btn-primary" disabled={!!busy || counts.new + counts.conflict === 0} onClick={commit}>
              Import {counts.new + (conflictPolicy === "overwrite" ? counts.conflict : Object.values(overrides).filter((o) => o === "overwrite").length)} entries
            </button>
            <button className="btn-ghost" onClick={() => setStep("match")}>Back</button>
          </div>
          <p className="mt-2 text-xs text-stone-500">You can undo this whole import later from Past imports.</p>
        </div>
      )}

      {step === "done" && result && (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <CheckCircle2 className="mb-3 h-12 w-12 text-emerald-600" />
          <h3 className="font-display text-2xl font-semibold text-brew-dark">Imported!</h3>
          <p className="mt-2 text-stone-600">
            {result.created} added · {result.updated} updated · {result.skipped} skipped
            {result.newRootBeers > 0 && ` · ${result.newRootBeers} new root beers added to the catalog`}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/log" className="btn-primary">See my log</Link>
            <button className="btn-secondary" onClick={() => { setStep("upload"); setSheets([]); setResult(null); }}>Import another file</button>
            <Link href="/import/history" className="btn-ghost">Undo / past imports</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "stone" }) {
  const cls = tone === "emerald" ? "bg-emerald-50 text-emerald-800" : tone === "amber" ? "bg-amber-50 text-amber-800" : "bg-stone-50 text-stone-600";
  return (
    <div className={`rounded-xl px-3 py-3 ${cls}`}>
      <p className="font-display text-2xl font-semibold">{value}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}
