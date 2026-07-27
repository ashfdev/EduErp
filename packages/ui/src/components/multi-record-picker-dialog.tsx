"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import { SearchInput } from "./search-input";
import { Checkbox } from "./checkbox";
import { Button } from "./button";
import type { RecordPickerResult } from "./record-picker-dialog";

export interface MultiRecordPickerDialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  searchPlaceholder?: string;
  fetchResults: (params: { search: string; page: number }) => Promise<RecordPickerResult<T>>;
  renderRow: (item: T) => React.ReactNode;
  getKey: (item: T) => string;
  selected: string[];
  onToggle: (item: T) => void;
  // Extra filter controls (e.g. Class/Section selects) rendered above the
  // search box.
  filters?: React.ReactNode;
  // A string that changes whenever `filters`' underlying values change
  // (e.g. `${classId}:${sectionId}`) -- without this, selecting a filter
  // alone (no search typed, no page click) silently would not refetch,
  // since this component has no other way to see filter state owned by
  // the caller.
  filterKey?: string;
  confirmLabel: string;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;
}

// Multi-select sibling to RecordPickerDialog (Plan Fourteen) -- the shared
// answer to "pick several students, then bulk-act on them" (bulk waiver
// assignment, bulk fine), instead of every screen needing its own one-off
// roster-with-checkboxes implementation.
export function MultiRecordPickerDialog<T>({
  open,
  onOpenChange,
  title,
  searchPlaceholder = "Search...",
  fetchResults,
  renderRow,
  getKey,
  selected,
  onToggle,
  filters,
  filterKey,
  confirmLabel,
  onConfirm,
  confirmDisabled,
  confirmLoading,
}: MultiRecordPickerDialogProps<T>) {
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [result, setResult] = React.useState<RecordPickerResult<T>>({ data: [] });
  const [loading, setLoading] = React.useState(false);

  const fetchResultsRef = React.useRef(fetchResults);
  fetchResultsRef.current = fetchResults;

  const prevFilterKeyRef = React.useRef(filterKey);

  React.useEffect(() => {
    if (!open) return;
    // A filter change resets to page 1 first rather than fetching with a
    // page number that may no longer be valid against the narrower result
    // set -- this effect re-runs once `page` settles to 1, so this never
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
        />
        <div className="max-h-72 overflow-y-auto rounded-md border">
          {loading && <p className="p-4 text-center text-sm text-muted-foreground">Loading...</p>}
          {!loading && !result.data.length && <p className="p-4 text-center text-sm text-muted-foreground">No results found.</p>}
          {!loading &&
            result.data.map((item) => {
              const key = getKey(item);
              return (
                <label key={key} className="flex w-full cursor-pointer items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-accent">
                  <Checkbox checked={selected.includes(key)} onCheckedChange={() => onToggle(item)} />
                  {renderRow(item)}
                </label>
              );
            })}
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
        <div className="flex items-center justify-between border-t pt-3">
          <p className="text-sm text-muted-foreground">{selected.length} selected</p>
          <DialogFooter className="mt-0">
            <Button disabled={!selected.length || confirmDisabled || confirmLoading} onClick={onConfirm}>
              {confirmLoading ? "Working..." : confirmLabel}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
