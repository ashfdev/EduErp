"use client";

import { Checkbox } from "./checkbox";
import { cn } from "../lib/utils";

export interface MultiSelectChecklistOption {
  id: string;
  label: string;
}

interface MultiSelectChecklistProps {
  options: MultiSelectChecklistOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  className?: string;
  emptyLabel?: string;
}

// Shared "pick several classes" checklist (Plan Fourteen, Phase N) -- used
// by both the Fee Fine Rule dialog's "Select Classes" step and the Fee
// Structure "Assign to Classes" flow, so the two never drift in shape.
export function MultiSelectChecklist({ options, selected, onChange, className, emptyLabel = "Nothing to select" }: MultiSelectChecklistProps) {
  if (!options.length) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  return (
    <div className={cn("grid max-h-56 grid-cols-2 gap-x-4 gap-y-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-3", className)}>
      {options.map((opt) => (
        <label key={opt.id} className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={selected.includes(opt.id)} onCheckedChange={() => toggle(opt.id)} />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}
