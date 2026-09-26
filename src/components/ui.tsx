import type { ReactNode } from "react";
import { FRESHNESS_DOT, formatDate, formatRating, freshness, ratingColor } from "@/lib/format";

export function RatingBadge({ rating, size = "md", label }: { rating: number | null; size?: "sm" | "md" | "lg"; label?: string }) {
  if (rating == null) {
    return <span className="inline-flex items-center rounded-lg bg-stone-100 px-2 py-0.5 text-sm font-semibold text-stone-400">–</span>;
  }
  const cls = size === "lg" ? "min-w-14 px-3 py-1.5 text-2xl" : size === "sm" ? "min-w-8 px-1.5 py-0.5 text-xs" : "min-w-10 px-2 py-1 text-base";
  return (
    <span className={`inline-flex items-center justify-center rounded-xl font-display font-semibold tabular-nums ${ratingColor(rating)} ${cls}`} aria-label={`${label ?? "Rating"} ${formatRating(rating)} out of 10`}>
      {formatRating(rating)}
    </span>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-semibold text-brew-dark">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 text-4xl" aria-hidden>🍺</div>
      <h2 className="font-display text-xl font-semibold text-brew-dark">{title}</h2>
      {children && <div className="mt-2 max-w-sm text-sm text-stone-600">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Thumb({ url, kind, alt, className = "h-16 w-16" }: { url: string | null; kind?: "image" | "video" | null; alt: string; className?: string }) {
  if (!url) {
    return (
      <div className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cream to-crema text-2xl ${className}`} aria-hidden>
        🥤
      </div>
    );
  }
  if (kind === "video") {
    return <video src={`${url}#t=0.1`} className={`shrink-0 rounded-xl bg-black object-cover ${className}`} muted playsInline preload="metadata" aria-label={alt} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={`shrink-0 rounded-xl object-cover ${className}`} loading="lazy" />;
}

/** Colored dot + "Picked up 3 days ago": green = within a month, amber = within 6 months, grey = older/unknown. */
export function FreshnessLabel({ date }: { date: string | null | undefined }) {
  const f = freshness(date);
  return (
    <span className="inline-flex items-center gap-1.5" title={date ? formatDate(date) : "No pickup date was given"}>
      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${FRESHNESS_DOT[f.tone]}`} aria-hidden />
      {f.label}
    </span>
  );
}

/** Big image at the top of a card (4:3). Falls back to a warm placeholder when there's no photo. */
export function CardImage({ url, kind, alt, children }: { url: string | null; kind?: "image" | "video" | null; alt: string; children?: ReactNode }) {
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-cream to-crema">
      {url ? (
        kind === "video" ? (
          <video src={`${url}#t=0.1`} className="h-full w-full object-cover" muted playsInline preload="metadata" aria-label={alt} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={alt} loading="lazy" className={`h-full w-full ${url.startsWith("/api/media") ? "object-cover" : "object-contain bg-white p-3"}`} />
        )
      ) : (
        <div className="flex h-full w-full items-center justify-center text-5xl opacity-70" aria-hidden>🥤</div>
      )}
      {children}
    </div>
  );
}

/** Responsive card grid: 1 across on small phones, 2 on large phones, 3 on normal screens, 4 on big screens. */
export function CardGrid({ children }: { children: ReactNode }) {
  return <ul className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-4">{children}</ul>;
}
