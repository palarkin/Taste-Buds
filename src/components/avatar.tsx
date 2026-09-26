export function Avatar({ name, color, size = "md" }: { name: string; color: string; size?: "xs" | "sm" | "md" }) {
  const initials = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const cls = size === "xs" ? "h-5 w-5 text-[9px]" : size === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-sm";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white ${cls}`}
      style={{ backgroundColor: color }}
      title={name}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}
