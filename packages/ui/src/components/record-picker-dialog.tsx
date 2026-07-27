"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import { SearchInput } from "./search-input";
import { Button } from "./button";

export interface RecordPickerMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RecordPickerResult<T> {
  data: T[];
  meta?: RecordPickerMeta;
}

export interface RecordPickerDialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  searchPlaceholder?: string;
  fetchResults: (params: { search: string; page: number }) => Promise<RecordPickerResult<T>>;
  renderRow: (item: T) => React.ReactNode;
  getKey: (item: T) => string;
  onSelect: (item: T) => void;
  // Extra filter controls (e.g. Class/Section selects) rendered above the
  // search box — the caller owns this state, so it's surfaced back here only
  // as a string the dialog can compare to know a filter changed (see
  // filterKey below); this component never needs to know what the filters
  // actually are.
  filters?: React.ReactNode;
  // A string that changes whenever `filters`' underlying values change
  // (e.g. `${classId}:${sectionId}`). Without this, selecting a filter alone
  // — with no search text typed and no page click — would silently not
  // refetch, since the fetch effect's own dependency list has no way to see
  // filter state living in the caller.
  filterKey?: string;
}

// Generic "find a record, then act on it" picker — the shared answer to
// every single-record screen that used to require pasting a raw internal
// id. No debounce: matches this codebase's existing search pages (students,
// library books), which all re-fetch per keystroke via a changed query key
// rather than debouncing.
export function RecordPickerDialog<T>({
  open,
  onOpenChange,
  title,
  searchPlaceholder = "Search...",
  fetchResults,
  renderRow,
  getKey,
  onSelect,
  filters,
  filterKey,
}: RecordPickerDialogProps<T>) {
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [result, setResult] = React.useState<RecordPickerResult<T>>({ data: [] });
  const [loading, setLoading] = React.useState(false);

  // Held in a ref rather than a useEffect dependency — callers pass a new
  // inline closure on every render, and depending on it directly would
  // refetch every render instead of only on search/page change.
  const fetchResultsRef = React.useRef(fetchResults);
  fetchResultsRef.current = fetchResults;

  const prevFilterKeyRef = React.useRef(filterKey);

  React.useEffect(() => {
    if (!open) return;
    // A filter change resets to page 1 first rather than fetching with a
    // page number that may no longer be valid against the narrower result
    // set — this effect re-runs once `page` settles to 1, so this never
    // double-fetches.
    if (prevFilterKeyRef.current !== filterKey) {
      prevFilterKeyRef.current = filterKey;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }
    let cancelled = false;
    setLoading(true);
    fetchResultsRef
      .current({ search, page })
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, search, page, filterKey]);

  React.useEffect(() => {
    if (!open) {
      setSearch("");
      setPage(1);
      setResult({ data: [] });
    }
  }, [open]);

  function handleSelect(item: T) {
    onSelect(item);
    onOpenChange(false);
  }

  const meta = result.meta;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {filters && <div className="flex flex-wrap gap-2">{filters}</div>}
        <SearchInput
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          autoFocus
        />
        <div className="max-h-80 overflow-y-auto rounded-md border">
          {loading && <p className="p-4 text-center text-sm text-muted-foreground">Loading...</p>}
          {!loading && !result.data.length && <p className="p-4 text-center text-sm text-muted-foreground">No results found.</p>}
          {!loading &&
            result.data.map((item) => (
              <button
                key={getKey(item)}
                type="button"
                onClick={() => handleSelect(item)}
                className="flex w-full items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-accent"
              >
                {renderRow(item)}
              </button>
            ))}
        </div>
        {!!meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {meta.page} of {meta.totalPages}
            </span>
            <Button size="sm" variant="outline" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
