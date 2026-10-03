import { Search } from "lucide-react";

/** Rounded search field used beside the filter button on list screens. Submits its parent GET form. */
export function SearchInput({ name, defaultValue, placeholder }: { name: string; defaultValue?: string; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-stone-400" />
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 w-full rounded-full border border-crema bg-white pl-10 pr-4 text-[17px] text-ink shadow-sm outline-none placeholder:text-stone-500 focus:border-sassafras focus:ring-2 focus:ring-sassafras/25"
      />
    </div>
  );
}
