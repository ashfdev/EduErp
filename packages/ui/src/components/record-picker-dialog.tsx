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

  React.useEffect(() => {
    if (!open) return;
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
  }, [open, search, page]);

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
