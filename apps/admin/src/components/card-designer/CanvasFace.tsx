"use client";

import { Rnd } from "react-rnd";
import type { FieldBox, FieldDescriptor, CardCanvas } from "@education-erp/validators";

// True 96dpi conversion — the compiled CSS uses mm units directly (DPI-agnostic
// at render time), this factor is only for on-screen editing proportions.
export const PX_PER_MM = 96 / 25.4;

function fieldPreviewText(box: FieldBox, descriptor: FieldDescriptor | undefined): string {
  switch (box.kind) {
    case "LOGO":
      return "[Logo]";
    case "SIGNATURE":
      return "[Signature]";
    case "BARCODE":
      return "[Barcode]";
    case "QR":
      return "[QR Code]";
    case "PHOTO":
      return "[Photo]";
    case "IMAGE":
      return "[Image]";
    case "STATIC":
    case "RICH_TEXT":
      return box.static_text ?? descriptor?.default_static_text ?? descriptor?.label ?? "";
    case "TEXT":
    default:
      return `${box.label_prefix ?? ""}{{${descriptor?.data_path ?? descriptor?.label ?? box.field_key}}}`;
  }
}

interface CanvasFaceProps {
  canvas: CardCanvas;
  boxes: FieldBox[];
  descriptors: FieldDescriptor[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<FieldBox>) => void;
}

export function CanvasFace({ canvas, boxes, descriptors, selectedId, onSelect, onChange }: CanvasFaceProps) {
  const descByKey = new Map(descriptors.map((d) => [d.field_key, d]));
  const widthPx = canvas.width_mm * PX_PER_MM;
  const heightPx = canvas.height_mm * PX_PER_MM;
  const bleedPx = canvas.bleed_mm * PX_PER_MM;

  return (
    <div
      className="relative border shadow-sm"
      style={{ width: widthPx, height: heightPx, background: canvas.background_color }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      {/* Bleed guide — designer-only, never emitted into the compiled PDF */}
      <div
        className="pointer-events-none absolute border border-dashed border-red-400"
        style={{ left: bleedPx, top: bleedPx, right: bleedPx, bottom: bleedPx }}
      />

      {boxes.map((box) => {
        const descriptor = descByKey.get(box.field_key);
        const selected = box.id === selectedId;
        const crossesBleed = box.x_mm < canvas.bleed_mm || box.y_mm < canvas.bleed_mm ||
          box.x_mm + box.width_mm > canvas.width_mm - canvas.bleed_mm ||
          box.y_mm + box.height_mm > canvas.height_mm - canvas.bleed_mm;

        return (
          <Rnd
            key={box.id}
            size={{ width: box.width_mm * PX_PER_MM, height: box.height_mm * PX_PER_MM }}
            position={{ x: box.x_mm * PX_PER_MM, y: box.y_mm * PX_PER_MM }}
            bounds="parent"
            style={{ zIndex: box.z_index }}
            onDragStop={(_e, d) => onChange(box.id, { x_mm: Math.round((d.x / PX_PER_MM) * 10) / 10, y_mm: Math.round((d.y / PX_PER_MM) * 10) / 10 })}
            onResizeStop={(_e, _dir, ref, _delta, position) =>
              onChange(box.id, {
                width_mm: Math.round((ref.offsetWidth / PX_PER_MM) * 10) / 10,
                height_mm: Math.round((ref.offsetHeight / PX_PER_MM) * 10) / 10,
                x_mm: Math.round((position.x / PX_PER_MM) * 10) / 10,
                y_mm: Math.round((position.y / PX_PER_MM) * 10) / 10,
              })
            }
            onMouseDown={(e) => {
              e.stopPropagation();
              onSelect(box.id);
            }}
          >
            <div
              className={`h-full w-full overflow-hidden text-[8px] leading-tight ${selected ? "ring-2 ring-blue-500" : crossesBleed ? "ring-1 ring-red-400" : "ring-1 ring-transparent hover:ring-gray-300"}`}
              style={{
                fontFamily: box.font_family,
                fontSize: box.font_size_pt ? `${box.font_size_pt}pt` : undefined,
                fontWeight: box.font_weight,
                fontStyle: box.font_style,
                color: box.color,
                textAlign: box.text_align,
                lineHeight: box.line_height,
                border: box.border ? "1px solid #999" : undefined,
                borderRadius: box.border_radius ? `${box.border_radius}mm` : undefined,
                background: box.kind === "PHOTO" || box.kind === "IMAGE" || box.kind === "LOGO" ? "#eee" : undefined,
                display: "flex",
                alignItems: "center",
                justifyContent: box.kind === "PHOTO" || box.kind === "IMAGE" || box.kind === "LOGO" ? "center" : "flex-start",
              }}
            >
              {fieldPreviewText(box, descriptor)}
            </div>
          </Rnd>
        );
      })}
    </div>
  );
}
