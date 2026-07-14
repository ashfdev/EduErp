import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "../lib/utils";

// A live-filter input for an already-loaded list (a class roster, a
// question bank, etc.) — client-side only, no debounce/API call, since
// these lists are small (a section is dozens of rows, not thousands).
// Pages own their own filter predicate; this only standardizes the look.
export const SearchInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, value, onChange, ...props }, ref) => (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={ref}
        value={value}
        onChange={onChange}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background py-1 pl-8 pr-8 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
      {!!value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange?.({ target: { value: "" } } as React.ChangeEvent<HTMLInputElement>)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  ),
);
SearchInput.displayName = "SearchInput";
