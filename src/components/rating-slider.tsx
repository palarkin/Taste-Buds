"use client";

import { formatRating } from "@/lib/format";

// 5 is the midpoint and the starting value: an average root beer.
const WORDS: [number, string][] = [
  [9.5, "Legendary"],
  [8.5, "Outstanding"],
  [7, "Really good"],
  [5.5, "Above average"],
  [5, "Average"],
  [3.5, "Below average"],
  [2, "Not for me"],
  [0, "Drain pour"],
];

export function RatingSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const word = WORDS.find(([min]) => value >= min)?.[1];
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-display text-5xl font-semibold tabular-nums text-brew-dark">{formatRating(value)}</span>
        <span className="text-stone-500">/ 10</span>
        <span className="ml-auto text-sm font-medium text-brew">{word}</span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={0.5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rating-range w-full"
        aria-label="Rating out of 10"
      />
      <div className="mt-1 flex justify-between text-xs text-stone-400">
        <span>0</span>
        <span className="text-center">5 · Average</span>
        <span>10</span>
      </div>
    </div>
  );
}
