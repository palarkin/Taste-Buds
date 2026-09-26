"use client";

import { useOptimistic, useTransition } from "react";
import { Heart } from "lucide-react";
import { toggleFavorite } from "@/actions/tastings";

export function FavoriteButton({ rootBeerId, initial, withLabel = false }: { rootBeerId: string; initial: boolean; withLabel?: boolean }) {
  const [fav, setFav] = useOptimistic(initial);
  const [, start] = useTransition();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        start(async () => {
          setFav(!fav);
          await toggleFavorite(rootBeerId);
        });
      }}
      aria-pressed={fav}
      aria-label={fav ? "Remove from favorites" : "Add to favorites"}
      className={withLabel ? `btn-secondary ${fav ? "border-rose-200 text-rose-600" : ""}` : "rounded-full p-2 transition hover:bg-rose-50"}
    >
      <Heart className={`h-5 w-5 ${fav ? "fill-rose-500 text-rose-500" : "text-stone-400"}`} />
      {withLabel && (fav ? "Favorite" : "Add to favorites")}
    </button>
  );
}
