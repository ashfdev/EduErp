"use client";

import type { FieldBox, CardCanvas } from "@education-erp/validators";
import { FONT_PRESETS, SIZE_PRESETS } from "@education-erp/validators";
import { Button, Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Switch } from "@education-erp/ui";

interface PropertiesPanelProps {
  canvas: CardCanvas;
  onCanvasChange: (patch: Partial<CardCanvas>) => void;
  selected: FieldBox | null;
  onFieldChange: (patch: Partial<FieldBox>) => void;
  onDelete: () => void;
  hasBackFace: boolean;
}

function NumberField({ label, value, onChange, step = 1 }: { label: string; value: number | undefined; onChange: (v: number) => void; step?: number }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" step={step} value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))} className="h-8 text-xs" />
    </div>
  );
}

export function PropertiesPanel({ canvas, onCanvasChange, selected, onFieldChange, onDelete, hasBackFace }: PropertiesPanelProps) {
  if (!selected) {
    return (
      <div className="w-64 shrink-0 space-y-3 border-l pl-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">Canvas</p>
        <div className="space-y-1">
          <Label className="text-xs">Size Preset</Label>
          <Select
            value={canvas.size_preset}
            onValueChange={(v) => {
              const preset = SIZE_PRESETS[v];
              if (preset) onCanvasChange({ size_preset: v, width_mm: preset.width_mm, height_mm: preset.height_mm });
            }}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(SIZE_PRESETS).map(([key, preset]) => (
                <SelectItem key={key} value={key}>{preset.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Width (mm)" value={canvas.width_mm} onChange={(v) => onCanvasChange({ width_mm: v })} step={0.1} />
          <NumberField label="Height (mm)" value={canvas.height_mm} onChange={(v) => onCanvasChange({ height_mm: v })} step={0.1} />
        </div>
        <NumberField label="Bleed (mm)" value={canvas.bleed_mm} onChange={(v) => onCanvasChange({ bleed_mm: v })} step={0.5} />
        <div className="space-y-1">
          <Label className="text-xs">Background Color</Label>
          <input type="color" value={canvas.background_color} onChange={(e) => onCanvasChange({ background_color: e.target.value })} className="h-8 w-full rounded-md border" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Accent Color</Label>
          <input type="color" value={canvas.accent_color} onChange={(e) => onCanvasChange({ accent_color: e.target.value })} className="h-8 w-full rounded-md border" />
        </div>
        {!hasBackFace && <p className="text-xs text-muted-foreground">This document type has no back face (single-sided).</p>}
      </div>
    );
  }

  const s = selected;
  const showTextStyle = s.kind === "TEXT" || s.kind === "STATIC" || s.kind === "RICH_TEXT";

  return (
    <div className="w-64 shrink-0 space-y-3 overflow-y-auto border-l pl-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase text-muted-foreground">Field — {s.kind}</p>
        <Button size="sm" variant="destructive" onClick={onDelete}>Delete</Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X (mm)" value={s.x_mm} onChange={(v) => onFieldChange({ x_mm: v })} step={0.1} />
        <NumberField label="Y (mm)" value={s.y_mm} onChange={(v) => onFieldChange({ y_mm: v })} step={0.1} />
        <NumberField label="Width (mm)" value={s.width_mm} onChange={(v) => onFieldChange({ width_mm: v })} step={0.1} />
        <NumberField label="Height (mm)" value={s.height_mm} onChange={(v) => onFieldChange({ height_mm: v })} step={0.1} />
        <NumberField label="Rotation (deg)" value={s.rotation} onChange={(v) => onFieldChange({ rotation: v })} />
        <NumberField label="Z-Index" value={s.z_index} onChange={(v) => onFieldChange({ z_index: v })} />
      </div>

      {(s.kind === "STATIC" || s.kind === "RICH_TEXT") && (
        <div className="space-y-1">
          <Label className="text-xs">Text</Label>
          <textarea
            className="w-full rounded-md border px-2 py-1 text-xs"
            rows={3}
            value={s.static_text ?? ""}
            onChange={(e) => onFieldChange({ static_text: e.target.value })}
          />
        </div>
      )}

      {s.kind === "TEXT" && (
        <div className="space-y-1">
          <Label className="text-xs">Label Prefix</Label>
          <Input className="h-8 text-xs" value={s.label_prefix ?? ""} onChange={(e) => onFieldChange({ label_prefix: e.target.value })} placeholder="e.g. Roll: " />
        </div>
      )}

      {s.kind === "SIGNATURE" && (
        <NumberField label="Signature Slot" value={s.signature_slot ?? 1} onChange={(v) => onFieldChange({ signature_slot: v })} />
      )}

      {(s.kind === "PHOTO" || s.kind === "IMAGE") && (
        <div className="space-y-1">
          <Label className="text-xs">Object Fit</Label>
          <Select value={s.object_fit ?? "cover"} onValueChange={(v) => onFieldChange({ object_fit: v as FieldBox["object_fit"] })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cover">Cover</SelectItem>
              <SelectItem value="contain">Contain</SelectItem>
              <SelectItem value="fill">Fill</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {showTextStyle && (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Font</Label>
            <Select value={s.font_family ?? ""} onValueChange={(v) => onFieldChange({ font_family: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Default" /></SelectTrigger>
              <SelectContent>
                {FONT_PRESETS.map((f) => <SelectItem key={f.css_family} value={f.css_family}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Size (pt)" value={s.font_size_pt} onChange={(v) => onFieldChange({ font_size_pt: v })} />
            <div className="space-y-1">
              <Label className="text-xs">Weight</Label>
              <Select value={s.font_weight ?? "400"} onValueChange={(v) => onFieldChange({ font_weight: v as FieldBox["font_weight"] })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="400">Regular</SelectItem>
                  <SelectItem value="500">Medium</SelectItem>
                  <SelectItem value="600">Semibold</SelectItem>
                  <SelectItem value="700">Bold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Align</Label>
            <Select value={s.text_align ?? "left"} onValueChange={(v) => onFieldChange({ text_align: v as FieldBox["text_align"] })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="center">Center</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Color</Label>
            <input type="color" value={s.color ?? "#000000"} onChange={(e) => onFieldChange({ color: e.target.value })} className="h-8 w-full rounded-md border" />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Switch checked={s.font_style === "italic"} onCheckedChange={(v) => onFieldChange({ font_style: v ? "italic" : "normal" })} />
            Italic
          </label>
        </>
      )}

      <label className="flex items-center gap-2 text-xs">
        <Switch checked={s.border ?? false} onCheckedChange={(v) => onFieldChange({ border: v })} />
        Border
      </label>
    </div>
  );
}
