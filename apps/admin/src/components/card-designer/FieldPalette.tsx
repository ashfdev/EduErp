"use client";

import type { FieldDescriptor } from "@education-erp/validators";
import { Button } from "@education-erp/ui";

interface FieldPaletteProps {
  fields: FieldDescriptor[];
  activeFace: "front" | "back";
  usedKeys: Set<string>;
  onAdd: (descriptor: FieldDescriptor) => void;
}

export function FieldPalette({ fields, activeFace, usedKeys, onAdd }: FieldPaletteProps) {
  const groupLabel = activeFace === "front" ? "Front" : "Back";
  const visible = fields.filter((f) => f.group === groupLabel);

  return (
    <div className="w-56 shrink-0 space-y-1 overflow-y-auto border-r pr-3">
      <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">{groupLabel} Fields</p>
      {!visible.length && <p className="text-xs text-muted-foreground">No fields available for this face.</p>}
      {visible.map((f) => {
        const already = usedKeys.has(f.field_key);
        return (
          <Button
            key={f.field_key}
            size="sm"
            variant="outline"
            className="w-full justify-start text-xs"
            disabled={already}
            onClick={() => onAdd(f)}
          >
            {already ? "✓ " : "+ "}
            {f.label}
          </Button>
        );
      })}
    </div>
  );
}
