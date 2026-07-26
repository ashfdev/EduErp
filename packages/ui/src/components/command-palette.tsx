"use client";

import * as React from "react";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "cmdk";
import { cn } from "../lib/utils";

export interface CommandPaletteItem {
  id: string;
  label: string;
  sublabel?: string;
  group: string;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQueryChange: (query: string) => void;
  items: CommandPaletteItem[];
  loading?: boolean;
  placeholder?: string;
}

// Global admin search (Plan Fifteen, Phase C) — built on `cmdk`, already an
// installed-but-unused dependency in this package (the same "installed,
// never wired up" precedent this codebase already had for Tiptap before it
// was wired into Notices). `shouldFilter={false}` because the caller owns
// matching (live API search for Students/Staff, client-side fuzzy match for
// the static Settings-page list) — this component only renders whatever
// `items` it's given, grouped by `item.group`, in the order given.
export function CommandPalette({ open, onOpenChange, query, onQueryChange, items, loading, placeholder = "Search students, staff, settings..." }: CommandPaletteProps) {
  const groups = React.useMemo(() => {
    const map = new Map<string, CommandPaletteItem[]>();
    for (const item of items) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      label="Global search"
      shouldFilter={false}
      overlayClassName="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      contentClassName={cn(
        "fixed left-1/2 top-[15%] z-50 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg",
      )}
    >
      <div className="flex items-center gap-2 border-b px-3">
        <CommandInput
          autoFocus
          value={query}
          onValueChange={onQueryChange}
          placeholder={placeholder}
          className="flex h-12 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <CommandList className="max-h-80 overflow-y-auto p-2">
        {loading && <div className="px-2 py-6 text-center text-sm text-muted-foreground">Searching...</div>}
        {!loading && !items.length && (
          <CommandEmpty className="px-2 py-6 text-center text-sm text-muted-foreground">No results found.</CommandEmpty>
        )}
        {!loading &&
          groups.map(([group, groupItems]) => (
            <CommandGroup
              key={group}
              heading={group}
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              {groupItems.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => {
                    item.onSelect();
                    onOpenChange(false);
                  }}
                  className="flex cursor-pointer flex-col rounded-md px-2 py-2 text-sm data-[selected=true]:bg-accent"
                >
                  <span className="font-medium">{item.label}</span>
                  {item.sublabel && <span className="text-xs text-muted-foreground">{item.sublabel}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
      </CommandList>
    </CommandDialog>
  );
}
