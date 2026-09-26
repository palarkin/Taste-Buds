import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

// Spreadsheet-style list view shared by My Log and the Directory.
// The table scrolls sideways inside its own card on narrow screens, never the whole page.

export function DataTable({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm" aria-label={label}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-[#f7f0e6] text-[11px] font-semibold uppercase tracking-wide text-stone-500">
      <tr className="border-b border-crema">{children}</tr>
    </thead>
  );
}

/** Column header. With `href` it becomes a sort link; `active` shows the current sort direction. */
export function Th({
  children,
  href,
  active,
  dir = "desc",
  className = "",
  align = "left",
}: {
  children?: ReactNode;
  href?: string;
  active?: boolean;
  dir?: "asc" | "desc";
  className?: string;
  align?: "left" | "right" | "center";
}) {
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const Arrow = dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <th scope="col" className={`whitespace-nowrap px-3 py-2.5 font-semibold ${alignCls} ${className}`} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      {href ? (
        <Link href={href} scroll={false} className={`inline-flex items-center gap-0.5 hover:text-brew ${active ? "text-brew-dark" : ""}`}>
          {children}
          {active && <Arrow className="h-3.5 w-3.5" />}
        </Link>
      ) : (
        children
      )}
    </th>
  );
}

/** Row whose first link covers the whole row (the row is the click target). */
export function Tr({ children }: { children: ReactNode }) {
  return <tr className="relative border-b border-crema/60 transition last:border-0 odd:bg-white even:bg-[#fcf8f2] hover:bg-cream/70">{children}</tr>;
}

export function Td({ children, className = "", align = "left" }: { children?: ReactNode; className?: string; align?: "left" | "right" | "center" }) {
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "";
  return <td className={`px-3 py-2 align-middle ${alignCls} ${className}`}>{children}</td>;
}

/** Link that stretches over the whole row. */
export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-ink after:absolute after:inset-0 after:content-['']">
      {children}
    </Link>
  );
}
