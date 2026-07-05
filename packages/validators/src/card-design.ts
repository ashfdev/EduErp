import { z } from "zod";
import type { DocumentType } from "@education-erp/types";

// ─────────────────────────────────────────────
// Data model — all geometry in mm (DPI-agnostic); compiles 1:1 to the
// Puppeteer/Handlebars pipeline already proven by every hand-authored
// template in server/api/src/templates/defaults/.
// ─────────────────────────────────────────────

export const cardFieldKindSchema = z.enum(["TEXT", "STATIC", "RICH_TEXT", "PHOTO", "LOGO", "SIGNATURE", "BARCODE", "QR", "IMAGE"]);
export type CardFieldKind = z.infer<typeof cardFieldKindSchema>;

export const fieldBoxSchema = z.object({
  id: z.string().min(1),
  field_key: z.string().min(1),
  kind: cardFieldKindSchema,
  x_mm: z.number(),
  y_mm: z.number(),
  width_mm: z.number().positive(),
  height_mm: z.number().positive(),
  rotation: z.number().default(0),
  z_index: z.number().int().default(0),
  font_family: z.string().optional(),
  font_size_pt: z.number().positive().optional(),
  font_weight: z.enum(["400", "500", "600", "700"]).optional(),
  font_style: z.enum(["normal", "italic"]).optional(),
  color: z.string().optional(),
  text_align: z.enum(["left", "center", "right"]).optional(),
  line_height: z.number().positive().optional(),
  letter_spacing: z.number().optional(),
  // STATIC kind's literal text (card title, "if found return to..." message,
  // etc.) — user-editable per instance, unlike TEXT kind whose content comes
  // from data_path on the matching FIELD_CATALOG entry.
  static_text: z.string().optional(),
  label_prefix: z.string().optional(),
  object_fit: z.enum(["cover", "contain", "fill"]).optional(),
  border: z.boolean().optional(),
  border_radius: z.number().optional(),
  // Which AuthorityConfig slot this SIGNATURE box renders (existing
  // {{signatureBlock N}} helper, reused verbatim — never reinvented).
  signature_slot: z.number().int().optional(),
});
export type FieldBox = z.infer<typeof fieldBoxSchema>;

export const cardCanvasSchema = z.object({
  size_preset: z.string(),
  width_mm: z.number().positive(),
  height_mm: z.number().positive(),
  bleed_mm: z.number().default(3),
  background_color: z.string().default("#ffffff"),
  background_image_url: z.string().optional(),
  accent_color: z.string().default("#1a3c4a"),
  dpi: z.number().default(96),
});
export type CardCanvas = z.infer<typeof cardCanvasSchema>;

export const cardDesignSchema = z.object({
  version: z.literal(1),
  canvas: cardCanvasSchema,
  faces: z.object({
    front: z.array(fieldBoxSchema),
    back: z.array(fieldBoxSchema).nullable(),
  }),
});
export type CardDesign = z.infer<typeof cardDesignSchema>;

// ─────────────────────────────────────────────
// Size presets (print-industry standard dimensions, CR-80 + certificate paper sizes)
// ─────────────────────────────────────────────

export const SIZE_PRESETS: Record<string, { label: string; width_mm: number; height_mm: number }> = {
  ID_CARD: { label: "ID Card — CR-80 Landscape (85.6×54mm)", width_mm: 85.6, height_mm: 54 },
  ID_CARD_PORTRAIT: { label: "ID Card — CR-80 Portrait (54×85.6mm)", width_mm: 54, height_mm: 85.6 },
  BADGE: { label: "Badge / Oversized (3.5\"×5.5\")", width_mm: 88.9, height_mm: 139.7 },
  A4: { label: "A4 (210×297mm)", width_mm: 210, height_mm: 297 },
  LETTER: { label: "Letter (8.5\"×11\")", width_mm: 215.9, height_mm: 279.4 },
};

// ─────────────────────────────────────────────
// Font presets — curated, not open Google Fonts. Per-field dropdown in the
// designer, defaulted by doc-type category but not restricted.
// ─────────────────────────────────────────────

export interface FontPreset {
  label: string;
  css_family: string;
  google_href?: string;
  category: "sans" | "serif" | "script" | "bangla";
}

export const FONT_PRESETS: FontPreset[] = [
  { label: "Roboto", css_family: "'Roboto', sans-serif", google_href: "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700&display=swap", category: "sans" },
  { label: "Open Sans", css_family: "'Open Sans', sans-serif", google_href: "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap", category: "sans" },
  { label: "Montserrat", css_family: "'Montserrat', sans-serif", google_href: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap", category: "sans" },
  { label: "Arial / Helvetica", css_family: "Arial, Helvetica, sans-serif", category: "sans" },
  { label: "Times New Roman", css_family: "'Times New Roman', serif", category: "serif" },
  { label: "Georgia", css_family: "Georgia, serif", category: "serif" },
  { label: "EB Garamond", css_family: "'EB Garamond', serif", google_href: "https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600;700&display=swap", category: "serif" },
  { label: "Playfair Display", css_family: "'Playfair Display', serif", google_href: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap", category: "serif" },
  { label: "Great Vibes (script)", css_family: "'Great Vibes', cursive", google_href: "https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap", category: "script" },
  { label: "Noto Sans Bengali", css_family: "'Noto Sans Bengali', sans-serif", google_href: "https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap", category: "bangla" },
  { label: "Hind Siliguri", css_family: "'Hind Siliguri', sans-serif", google_href: "https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap", category: "bangla" },
];

// ─────────────────────────────────────────────
// Field catalog — the designer's available-fields palette per doc type.
// data_path is the Handlebars expression body (no braces) resolved against
// whatever data shape that doc type's renderDocument()/renderDocumentBatch()
// caller already passes — never a new data shape invented for the designer.
// ─────────────────────────────────────────────

export interface FieldDescriptor {
  field_key: string;
  kind: CardFieldKind;
  label: string;
  default_size_mm: { width: number; height: number };
  group: "Front" | "Back";
  data_path?: string;
  default_static_text?: string;
}

const idCardBackFields: FieldDescriptor[] = [
  { field_key: "terms", kind: "STATIC", label: "Terms & Conditions", default_size_mm: { width: 75, height: 20 }, group: "Back", default_static_text: "This card is the property of the institution and must be surrendered upon request." },
  { field_key: "return_notice", kind: "STATIC", label: "If Found, Return To...", default_size_mm: { width: 75, height: 10 }, group: "Back", default_static_text: "If found, please return to {{institution.name_en}}, {{institution.address}}. Hotline: {{institution.phone}}" },
  { field_key: "signature_back", kind: "SIGNATURE", label: "Signature", default_size_mm: { width: 30, height: 15 }, group: "Back" },
];

export const FIELD_CATALOG: Partial<Record<DocumentType, FieldDescriptor[]>> = {
  STUDENT_ID_CARD: [
    { field_key: "logo", kind: "LOGO", label: "Institution Logo", default_size_mm: { width: 12, height: 12 }, group: "Front" },
    { field_key: "institution_name", kind: "TEXT", label: "Institution Name", default_size_mm: { width: 50, height: 6 }, group: "Front", data_path: "institution.name_en" },
    { field_key: "card_title", kind: "STATIC", label: "Card Title", default_size_mm: { width: 30, height: 5 }, group: "Front", default_static_text: "STUDENT" },
    { field_key: "photo", kind: "PHOTO", label: "Student Photo", default_size_mm: { width: 18, height: 22 }, group: "Front", data_path: "student.photo_url" },
    { field_key: "name", kind: "TEXT", label: "Student Name", default_size_mm: { width: 45, height: 6 }, group: "Front", data_path: "student.name_en" },
    { field_key: "student_uid", kind: "TEXT", label: "Student ID", default_size_mm: { width: 30, height: 5 }, group: "Front", data_path: "student.student_uid" },
    { field_key: "class_or_course", kind: "TEXT", label: "Class / Course", default_size_mm: { width: 40, height: 5 }, group: "Front", data_path: "student.current_class.name_en" },
    { field_key: "group_shift", kind: "TEXT", label: "Group & Shift", default_size_mm: { width: 30, height: 5 }, group: "Front", data_path: "student.current_section.name" },
    { field_key: "blood_group", kind: "TEXT", label: "Blood Group", default_size_mm: { width: 20, height: 5 }, group: "Front", data_path: "student.blood_group" },
    { field_key: "roll_no", kind: "TEXT", label: "Roll No", default_size_mm: { width: 20, height: 5 }, group: "Front", data_path: "student.current_roll_no" },
    { field_key: "expiry", kind: "STATIC", label: "Expiry / Valid Until", default_size_mm: { width: 35, height: 5 }, group: "Front", default_static_text: "Valid until: __ / __ / ____" },
    { field_key: "barcode", kind: "BARCODE", label: "Barcode", default_size_mm: { width: 30, height: 10 }, group: "Front", data_path: "student.student_uid" },
    ...idCardBackFields,
  ],
  STAFF_ID_CARD: [
    { field_key: "logo", kind: "LOGO", label: "Institution Logo", default_size_mm: { width: 12, height: 12 }, group: "Front" },
    { field_key: "institution_name", kind: "TEXT", label: "Institution Name", default_size_mm: { width: 50, height: 6 }, group: "Front", data_path: "institution.name_en" },
    { field_key: "card_title", kind: "STATIC", label: "Card Title", default_size_mm: { width: 30, height: 5 }, group: "Front", default_static_text: "STAFF" },
    { field_key: "photo", kind: "PHOTO", label: "Staff Photo", default_size_mm: { width: 18, height: 22 }, group: "Front", data_path: "staff.photo_url" },
    { field_key: "name", kind: "TEXT", label: "Staff Name", default_size_mm: { width: 45, height: 6 }, group: "Front", data_path: "staff.name_en" },
    { field_key: "staff_uid", kind: "TEXT", label: "Staff ID", default_size_mm: { width: 30, height: 5 }, group: "Front", data_path: "staff.staff_uid" },
    { field_key: "designation", kind: "TEXT", label: "Designation", default_size_mm: { width: 40, height: 5 }, group: "Front", data_path: "staff.designation" },
    { field_key: "department", kind: "TEXT", label: "Department", default_size_mm: { width: 40, height: 5 }, group: "Front", data_path: "staff.department.name" },
    { field_key: "blood_group", kind: "TEXT", label: "Blood Group", default_size_mm: { width: 20, height: 5 }, group: "Front", data_path: "staff.blood_group" },
    { field_key: "phone", kind: "TEXT", label: "Phone", default_size_mm: { width: 30, height: 5 }, group: "Front", data_path: "staff.phone" },
    { field_key: "expiry", kind: "STATIC", label: "Expiry / Valid Until", default_size_mm: { width: 35, height: 5 }, group: "Front", default_static_text: "Valid until: __ / __ / ____" },
    { field_key: "barcode", kind: "BARCODE", label: "Barcode", default_size_mm: { width: 30, height: 10 }, group: "Front", data_path: "staff.staff_uid" },
    ...idCardBackFields,
  ],
  TRANSPORT_CARD: [
    { field_key: "logo", kind: "LOGO", label: "Institution Logo", default_size_mm: { width: 12, height: 12 }, group: "Front" },
    { field_key: "institution_name", kind: "TEXT", label: "Institution Name", default_size_mm: { width: 50, height: 6 }, group: "Front", data_path: "institution.name_en" },
    { field_key: "card_title", kind: "STATIC", label: "Card Title", default_size_mm: { width: 30, height: 5 }, group: "Front", default_static_text: "TRANSPORT CARD" },
    { field_key: "photo", kind: "PHOTO", label: "Student Photo", default_size_mm: { width: 18, height: 22 }, group: "Front", data_path: "student.photo_url" },
    { field_key: "name", kind: "TEXT", label: "Student Name", default_size_mm: { width: 45, height: 6 }, group: "Front", data_path: "student.name_en" },
    { field_key: "route_stop", kind: "TEXT", label: "Route / Pickup Stop", default_size_mm: { width: 45, height: 5 }, group: "Front", data_path: "transport.route.name" },
    { field_key: "vehicle", kind: "TEXT", label: "Vehicle No", default_size_mm: { width: 30, height: 5 }, group: "Front", data_path: "transport.vehicle_no" },
    { field_key: "valid_until", kind: "STATIC", label: "Valid Until", default_size_mm: { width: 35, height: 5 }, group: "Front", default_static_text: "Valid until: __ / __ / ____" },
    { field_key: "barcode", kind: "BARCODE", label: "Barcode", default_size_mm: { width: 30, height: 10 }, group: "Front", data_path: "student.student_uid" },
    ...idCardBackFields,
  ],
  HOSTEL_CARD: [
    { field_key: "logo", kind: "LOGO", label: "Institution Logo", default_size_mm: { width: 12, height: 12 }, group: "Front" },
    { field_key: "institution_name", kind: "TEXT", label: "Institution Name", default_size_mm: { width: 50, height: 6 }, group: "Front", data_path: "institution.name_en" },
    { field_key: "card_title", kind: "STATIC", label: "Card Title", default_size_mm: { width: 30, height: 5 }, group: "Front", default_static_text: "HOSTEL CARD" },
    { field_key: "photo", kind: "PHOTO", label: "Student Photo", default_size_mm: { width: 18, height: 22 }, group: "Front", data_path: "student.photo_url" },
    { field_key: "name", kind: "TEXT", label: "Student Name", default_size_mm: { width: 45, height: 6 }, group: "Front", data_path: "student.name_en" },
    { field_key: "hall_room", kind: "TEXT", label: "Hall / Room No", default_size_mm: { width: 45, height: 5 }, group: "Front", data_path: "hostel.room.room_no" },
    { field_key: "bed_no", kind: "TEXT", label: "Bed No", default_size_mm: { width: 25, height: 5 }, group: "Front", data_path: "hostel.bed_no" },
    { field_key: "valid_until", kind: "STATIC", label: "Valid Until", default_size_mm: { width: 35, height: 5 }, group: "Front", default_static_text: "Valid until: __ / __ / ____" },
    { field_key: "barcode", kind: "BARCODE", label: "Barcode", default_size_mm: { width: 30, height: 10 }, group: "Front", data_path: "student.student_uid" },
    ...idCardBackFields,
  ],
  REGISTRATION_CARD: [
    { field_key: "logo", kind: "LOGO", label: "Institution Logo", default_size_mm: { width: 16, height: 16 }, group: "Front" },
    { field_key: "institution_name", kind: "TEXT", label: "Institution Name", default_size_mm: { width: 70, height: 8 }, group: "Front", data_path: "institution.name_en" },
    { field_key: "card_title", kind: "STATIC", label: "Card Title", default_size_mm: { width: 40, height: 8 }, group: "Front", default_static_text: "ADMISSION TEST REGISTRATION CARD" },
    { field_key: "photo", kind: "PHOTO", label: "Applicant Photo", default_size_mm: { width: 25, height: 32 }, group: "Front", data_path: "applicant.photo_url" },
    { field_key: "name", kind: "TEXT", label: "Applicant Name", default_size_mm: { width: 50, height: 6 }, group: "Front", data_path: "applicant.name" },
    { field_key: "admission_roll", kind: "TEXT", label: "Admission Roll", default_size_mm: { width: 35, height: 5 }, group: "Front", data_path: "applicant.roll" },
    { field_key: "class_name", kind: "TEXT", label: "Applying For", default_size_mm: { width: 40, height: 5 }, group: "Front", data_path: "applicant.class_name" },
    { field_key: "test_date", kind: "TEXT", label: "Test Date", default_size_mm: { width: 35, height: 5 }, group: "Front", data_path: "test.date" },
    { field_key: "test_venue", kind: "TEXT", label: "Venue", default_size_mm: { width: 50, height: 5 }, group: "Front", data_path: "test.venue" },
    { field_key: "test_hall_seat", kind: "TEXT", label: "Hall / Seat No", default_size_mm: { width: 35, height: 5 }, group: "Front", data_path: "test.hall" },
    { field_key: "barcode", kind: "BARCODE", label: "Barcode", default_size_mm: { width: 30, height: 10 }, group: "Front", data_path: "applicant.roll" },
    { field_key: "signature_front", kind: "SIGNATURE", label: "Authority Signature", default_size_mm: { width: 30, height: 15 }, group: "Front" },
  ],
  CERTIFICATE: [
    { field_key: "logo", kind: "LOGO", label: "Institution Logo", default_size_mm: { width: 20, height: 20 }, group: "Front" },
    { field_key: "institution_name", kind: "TEXT", label: "Institution Name", default_size_mm: { width: 150, height: 12 }, group: "Front", data_path: "institution.name_en" },
    { field_key: "cert_title", kind: "STATIC", label: "Certificate Title", default_size_mm: { width: 130, height: 10 }, group: "Front", default_static_text: "CERTIFICATE OF EXCELLENCE" },
    { field_key: "body", kind: "RICH_TEXT", label: "Body Text", default_size_mm: { width: 160, height: 40 }, group: "Front", default_static_text: "This certificate is proudly presented to" },
    { field_key: "recipient_name", kind: "TEXT", label: "Recipient Name", default_size_mm: { width: 120, height: 14 }, group: "Front", data_path: "recipient.name" },
    { field_key: "issue_date", kind: "TEXT", label: "Issue Date", default_size_mm: { width: 40, height: 6 }, group: "Front", data_path: "issue_date" },
    { field_key: "signature_1", kind: "SIGNATURE", label: "Signature 1", default_size_mm: { width: 35, height: 16 }, group: "Front" },
    { field_key: "signature_2", kind: "SIGNATURE", label: "Signature 2", default_size_mm: { width: 35, height: 16 }, group: "Front" },
    { field_key: "seal", kind: "IMAGE", label: "Seal / Emblem", default_size_mm: { width: 25, height: 25 }, group: "Front", data_path: "institution.logo_url" },
  ],
  TESTIMONIAL: [
    { field_key: "logo", kind: "LOGO", label: "Institution Logo", default_size_mm: { width: 18, height: 18 }, group: "Front" },
    { field_key: "institution_name", kind: "TEXT", label: "Institution Name", default_size_mm: { width: 140, height: 10 }, group: "Front", data_path: "institution.name_en" },
    { field_key: "cert_title", kind: "STATIC", label: "Title", default_size_mm: { width: 100, height: 8 }, group: "Front", default_static_text: "TESTIMONIAL" },
    { field_key: "body", kind: "RICH_TEXT", label: "Body Text", default_size_mm: { width: 160, height: 60 }, group: "Front", default_static_text: "This is to certify that {{student.name_en}} was a student of this institution." },
    { field_key: "student_name", kind: "TEXT", label: "Student Name", default_size_mm: { width: 80, height: 8 }, group: "Front", data_path: "student.name_en" },
    { field_key: "issue_date", kind: "TEXT", label: "Issue Date", default_size_mm: { width: 40, height: 6 }, group: "Front", data_path: "issue_date" },
    { field_key: "signature_1", kind: "SIGNATURE", label: "Signature", default_size_mm: { width: 35, height: 16 }, group: "Front" },
  ],
};

// ─────────────────────────────────────────────
// Compiler — one function, one place (shared between the admin live preview
// and the API's authoritative save). Emits Handlebars-templated HTML — data
// substitution still happens later via the existing renderDocument()/
// renderDocumentBatch() pipeline, completely unchanged.
// ─────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fieldContent(box: FieldBox, descriptor: FieldDescriptor | undefined): string {
  const path = descriptor?.data_path;
  switch (box.kind) {
    case "LOGO":
      return "{{institutionLogo}}";
    case "SIGNATURE":
      return `{{signatureBlock ${box.signature_slot ?? 1}}}`;
    case "STATIC":
      // Static text may itself contain Handlebars placeholders (e.g. the
      // "if found, return to {{institution.name_en}}" default) — emitted
      // raw, not escaped, so those placeholders still compile.
      return box.static_text ?? descriptor?.default_static_text ?? "";
    case "RICH_TEXT":
      return box.static_text ?? descriptor?.default_static_text ?? "";
    case "PHOTO":
    case "IMAGE": {
      const fit = box.object_fit ?? "cover";
      return `<img src="{{${path ?? ""}}}" style="width:100%;height:100%;object-fit:${fit};" />`;
    }
    case "BARCODE":
    case "QR": {
      // Pre-generated by renderDocumentBatch() (see pdf.service.ts) into a
      // synthetic per-field key, since Handlebars helpers run synchronously
      // and QR/barcode generation is async — resolved once per record before
      // Handlebars compiles, not inline in the template.
      return `<img src="{{__barcode_${box.id}}}" style="width:100%;height:100%;object-fit:contain;" />`;
    }
    case "TEXT":
    default:
      return path ? `${escapeHtml(box.label_prefix ?? "")}{{${path}}}` : "";
  }
}

function boxStyle(box: FieldBox): string {
  const parts = [
    "position:absolute",
    `left:${box.x_mm}mm`,
    `top:${box.y_mm}mm`,
    `width:${box.width_mm}mm`,
    `height:${box.height_mm}mm`,
    `z-index:${box.z_index}`,
  ];
  if (box.rotation) parts.push(`transform:rotate(${box.rotation}deg)`);
  if (box.font_family) parts.push(`font-family:${box.font_family}`);
  if (box.font_size_pt) parts.push(`font-size:${box.font_size_pt}pt`);
  if (box.font_weight) parts.push(`font-weight:${box.font_weight}`);
  if (box.font_style) parts.push(`font-style:${box.font_style}`);
  if (box.color) parts.push(`color:${box.color}`);
  if (box.text_align) parts.push(`text-align:${box.text_align}`);
  if (box.line_height) parts.push(`line-height:${box.line_height}`);
  if (box.letter_spacing) parts.push(`letter-spacing:${box.letter_spacing}mm`);
  if (box.border) parts.push("border:1px solid #999");
  if (box.border_radius) parts.push(`border-radius:${box.border_radius}mm`);
  parts.push("overflow:hidden");
  return parts.join(";");
}

function compileFace(boxes: FieldBox[], descriptors: FieldDescriptor[], widthMm: number, heightMm: number): string {
  const descByKey = new Map(descriptors.map((d) => [d.field_key, d]));
  const boxesHtml = boxes
    .map((box) => `<div style="${boxStyle(box)}">${fieldContent(box, descByKey.get(box.field_key))}</div>`)
    .join("\n");
  return `<div style="position:relative;width:${widthMm}mm;height:${heightMm}mm;overflow:hidden;">${boxesHtml}</div>`;
}

export function collectFontHrefs(design: CardDesign): string[] {
  const families = new Set<string>();
  for (const box of [...design.faces.front, ...(design.faces.back ?? [])]) {
    if (box.font_family) families.add(box.font_family);
  }
  const hrefs = new Set<string>();
  for (const preset of FONT_PRESETS) {
    if (families.has(preset.css_family) && preset.google_href) hrefs.add(preset.google_href);
  }
  return [...hrefs];
}

export function compileCardDesign(design: CardDesign, docType: DocumentType): { html_content: string; css_content: string } {
  const descriptors = FIELD_CATALOG[docType] ?? [];
  const { canvas } = design;
  const fontLinks = collectFontHrefs(design)
    .map((href) => `<link href="${href}" rel="stylesheet">`)
    .join("\n");

  const frontHtml = compileFace(design.faces.front, descriptors, canvas.width_mm, canvas.height_mm);
  const backHtml = design.faces.back ? compileFace(design.faces.back, descriptors, canvas.width_mm, canvas.height_mm) : "";
  const pageBreak = design.faces.back ? `<div style="page-break-after: always;"></div>` : "";

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Noto Sans Bengali', Arial, sans-serif; }
    body { width: ${canvas.width_mm}mm; }
    .card-face { background: ${canvas.background_color}; ${canvas.background_image_url ? `background-image:url('${canvas.background_image_url}');background-size:cover;` : ""} }
  `;

  const html = `<html>
<head>
<meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap" rel="stylesheet">
${fontLinks}
<style>${css}</style>
</head>
<body>
<div class="card-face">${frontHtml}</div>
${pageBreak}
${backHtml ? `<div class="card-face">${backHtml}</div>` : ""}
</body>
</html>`;

  return { html_content: html, css_content: "" };
}
