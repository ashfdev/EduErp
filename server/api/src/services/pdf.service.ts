import Handlebars from "handlebars";
import puppeteer from "puppeteer";
import QRCode from "qrcode";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../lib/prisma";
import type { DocumentType } from "@education-erp/types";
import { cardDesignSchema, SIZE_PRESETS, FIELD_CATALOG, type CardDesign } from "@education-erp/validators";

const DEFAULT_TEMPLATES_DIR = join(__dirname, "..", "templates", "defaults");
const PARTIALS_DIR = join(__dirname, "..", "templates", "partials");

const DOC_TYPE_SLUG: Partial<Record<DocumentType, string>> = {
  STUDENT_ID_CARD: "student-id-card",
  STAFF_ID_CARD: "staff-id-card",
  ADMIT_CARD: "admit-card",
  REGISTRATION_CARD: "registration-card",
  MARKSHEET: "marksheet",
  BLANK_MARKSHEET: "blank-marksheet",
  REPORT_CARD: "report-card",
  TABULATION_SHEET: "tabulation-sheet",
  MERIT_LIST: "merit-list",
  TESTIMONIAL: "testimonial",
  TRANSFER_CERTIFICATE: "transfer-certificate",
  ATTENDANCE_SHEET: "attendance-sheet",
  ATTENDANCE_BLANK: "attendance-blank",
  FEE_RECEIPT: "fee-receipt",
  PAYSLIP: "payslip",
  CERTIFICATE: "certificate",
  TRANSPORT_CARD: "transport-card",
  HOSTEL_CARD: "hostel-card",
  SEAT_PLAN: "seat-plan",
  NOTICE: "notice",
  VISITOR_SLIP: "visitor-slip",
  ROUTINE: "routine",
};

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigitsToWords(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${TENS[tens]}${ones ? ` ${ONES[ones]}` : ""}`;
}

function threeDigitsToWords(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(twoDigitsToWords(rest));
  return parts.join(" ");
}

// Indian/BD numbering system (Crore/Lakh/Thousand/Hundred) -- matches the
// convention used on printed BD school fee receipts, e.g. "One Hundred
// Taka Only". Whole numbers only (no paisa unit); falls back to the plain
// digits above 99,999,999 or below 0 rather than guessing a label.
function numberToWords(amount: number): string {
  if (amount === 0) return "Zero";
  if (amount >= 100000000 || amount < 0) return String(amount);

  const crore = Math.floor(amount / 10000000);
  const lakh = Math.floor((amount % 10000000) / 100000);
  const thousand = Math.floor((amount % 100000) / 1000);
  const hundred = amount % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${twoDigitsToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigitsToWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitsToWords(thousand)} Thousand`);
  if (hundred) parts.push(threeDigitsToWords(hundred));

  return parts.join(" ");
}

// Shared label/color mapping for a printed document's payment-status stamp
// (Invoice.status) -- the same statuses shown as StatusBadge in every admin
// list page, reused here so a printed receipt/invoice unambiguously shows
// whether it's paid, still due, overdue, or waived, matching that same
// color language.
const STATUS_STAMP_META: Record<string, { label: string; color: string }> = {
  PAID: { label: "PAID", color: "#16a34a" },
  PARTIAL: { label: "PARTIALLY PAID", color: "#d97706" },
  PENDING: { label: "UNPAID / DUE", color: "#dc2626" },
  OVERDUE: { label: "OVERDUE", color: "#991b1b" },
  WAIVED: { label: "WAIVED", color: "#64748b" },
};

let helpersRegistered = false;

function registerHelpers() {
  if (helpersRegistered) return;
  helpersRegistered = true;

  Handlebars.registerHelper("banglaDate", (date: unknown) => {
    if (!date) return "";
    const d = new Date(date as string | number | Date);
    if (Number.isNaN(d.getTime())) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  });

  // Was a fixed 3-bucket letter heuristic ("starts with A" => green) --
  // broke for "Abs" (also starts with "A", so an absent subject rendered
  // green) and hardcoded BD's A+/A/A- naming, ignoring whatever grade
  // letters/points the institution's actual active GradingScale defines
  // (CLAUDE.md: "no hardcoded institution-specific values"). Rather than a
  // schema migration to store a per-GradeRange color (a bigger, riskier
  // change for a purely cosmetic PDF heuristic), this derives a smooth
  // red->green color from the subject's real grade_point, normalized
  // against the highest grade_point in *this document's own* grading
  // scale (via `grading_legend`, already embedded in every marksheet/
  // report-card render — see buildMarksheetData in documents.routes.ts) --
  // so a UNIVERSITY's 4.00-max CGPA scale and a SCHOOL's 5.00-max GPA
  // scale each color correctly instead of assuming a fixed ceiling.
  Handlebars.registerHelper("gradeColor", function (grade: unknown, gradePoint: unknown, options?: Handlebars.HelperOptions) {
    const g = String(grade ?? "").toUpperCase();
    if (g === "F" || g === "FAIL" || g === "ABS") return "#dc2626";

    const point = typeof gradePoint === "number" ? gradePoint : Number(gradePoint);
    if (Number.isNaN(point)) return "#b8860b"; // no grade_point passed (older/custom template) -- same neutral amber the old heuristic's default bucket used

    const root = options?.data?.root as { grading_legend?: { grade_point: number }[] } | undefined;
    const legend = root?.grading_legend ?? [];
    const maxPoint = legend.length ? Math.max(...legend.map((r) => r.grade_point)) : 5;
    const ratio = maxPoint > 0 ? Math.max(0, Math.min(1, point / maxPoint)) : 0;
    const hue = Math.round(ratio * 120); // 0 = red, 120 = green
    return `hsl(${hue}, 68%, 38%)`;
  });

  Handlebars.registerHelper("ifPassed", function (this: unknown, marks: unknown, passMark: unknown, options: Handlebars.HelperOptions) {
    const m = typeof marks === "number" ? marks : Number(marks);
    const p = typeof passMark === "number" ? passMark : Number(passMark);
    if (!Number.isNaN(m) && !Number.isNaN(p) && m >= p) return options.fn(this);
    return options.inverse(this);
  });

  Handlebars.registerHelper("formatMarks", (marks: unknown) => {
    if (marks === null || marks === undefined || marks === "") return "--";
    return String(marks);
  });

  // 1-based row numbering for a `{{#each}}` loop's built-in 0-based @index
  // (e.g. a receipt's "Serial" column).
  Handlebars.registerHelper("inc", (index: unknown) => Number(index) + 1);

  // English amount-in-words for a printed receipt's "In Words" line (e.g.
  // "One Hundred Taka Only") -- matches the BD school-receipt convention
  // directly requested against the reference design. Whole-taka only
  // (paisa isn't a real unit in this system's Float amounts); values above
  // 99,999,999 fall back to the plain number rather than guessing a label.
  Handlebars.registerHelper("amountInWords", (amount: unknown) => new Handlebars.SafeString(numberToWords(Math.round(Number(amount) || 0))));

  // Rotated corner "stamp" showing a printed document's real payment
  // status (PAID/PARTIALLY PAID/UNPAID/OVERDUE/WAIVED) -- unambiguous at a
  // glance, matching the exact color language every admin list page's
  // StatusBadge already uses for the same Invoice.status values. Renders
  // nothing for an unrecognized/missing status rather than an empty stamp.
  Handlebars.registerHelper("statusStamp", (status: unknown) => {
    const meta = STATUS_STAMP_META[String(status ?? "")];
    if (!meta) return new Handlebars.SafeString("");
    return new Handlebars.SafeString(`<div class="status-stamp" style="border-color:${meta.color};color:${meta.color};">${meta.label}</div>`);
  });

  Handlebars.registerHelper("institutionLogo", function (this: unknown, options: Handlebars.HelperOptions) {
    const root = options.data?.root as { institution?: { logo_url?: string | null; name_en?: string } } | undefined;
    const logo = root?.institution?.logo_url;
    if (!logo) return new Handlebars.SafeString("");
    return new Handlebars.SafeString(`<img src="${logo}" alt="logo" class="institution-logo" />`);
  });

  // Low-opacity, centered institution-logo watermark (Plan Fourteen, Phase
  // L1) -- `position: fixed` (not `absolute`) is deliberate: Chromium's
  // print/PDF pagination repeats a fixed-position element on every printed
  // page, which is what makes this tile across a multi-page document
  // (tabulation sheets routinely span several pages) instead of only
  // appearing once at a single point in the document's flow. Templates
  // that don't call this helper are unaffected; no relative-positioning
  // wrapper is required on the caller's side.
  Handlebars.registerHelper("watermark", function (this: unknown, options: Handlebars.HelperOptions) {
    const root = options.data?.root as { institution?: { logo_url?: string | null } } | undefined;
    const logo = root?.institution?.logo_url;
    if (!logo) return new Handlebars.SafeString("");
    return new Handlebars.SafeString(
      `<img src="${logo}" alt="" class="watermark" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:60%;max-width:120mm;opacity:0.08;z-index:0;pointer-events:none;" />`,
    );
  });

  Handlebars.registerHelper("signatureBlock", function (this: unknown, slot: unknown, options: Handlebars.HelperOptions) {
    const root = options.data?.root as { signatures?: SignatureSlot[] } | undefined;
    const match = root?.signatures?.find((s) => s.slot === Number(slot));
    if (!match) {
      return new Handlebars.SafeString(`<div class="signature-block"><div class="sig-line"></div><p class="sig-label">Authorized Signature</p></div>`);
    }
    const img = match.signature_url ? `<img src="${match.signature_url}" class="sig-image" alt="signature" />` : "";
    return new Handlebars.SafeString(
      `<div class="signature-block">${img}<div class="sig-line"></div><p class="sig-name">${match.display_name}</p><p class="sig-designation">${match.designation}</p></div>`,
    );
  });

  // Shared header block (logo + institution name + address/phone/EIIN line,
  // Plan Fourteen Phase K) -- registered once, included via {{> letterhead}}
  // by every doc-type template instead of each one hand-rolling its own
  // copy. Deliberately just the brand text block, not styling: each
  // template's own <style> block still controls layout (flex row vs.
  // centered column) and logo sizing via its existing `.header img`-style
  // selector, so the partial only needs to live inside that same wrapper
  // div to pick up the right look -- nothing here overrides per-template CSS.
  Handlebars.registerPartial("letterhead", readFileSync(join(PARTIALS_DIR, "letterhead.html"), "utf-8"));
}

interface SignatureSlot {
  slot: number;
  label: string;
  display_name: string;
  designation: string;
  signature_url: string | null;
  seal_url: string | null;
}

async function getInstitutionBranding() {
  const profile = await prisma.institutionProfile.findUnique({ where: { id: "singleton" } });
  const config = await prisma.institutionConfig.findUnique({ where: { id: "singleton" } });
  return {
    name_en: profile?.name_en ?? "Institution Name",
    name_bn: profile?.name_bn ?? "",
    logo_url: profile?.logo_url ?? null,
    eiin: profile?.eiin ?? "",
    address: profile?.address ?? "",
    phone: profile?.phone_primary ?? "",
    email: profile?.email_primary ?? "",
    primary_color: profile?.primary_color ?? "#1a3c4a",
    secondary_color: profile?.secondary_color ?? "#2e7d9a",
    // Institution-type-aware terminology, reused by the card designer's
    // class/section fields so a university's card reads "Course" instead of
    // "Class" — same InstitutionConfig-driven system CLAUDE.md documents
    // elsewhere (nav labels, grading presets, etc.), just exposed to PDFs too.
    terms: {
      class: config?.term_class ?? "Class",
      section: config?.term_section ?? "Section",
      department: "Department",
    },
  };
}

async function getSignatureSlots(docType: DocumentType): Promise<SignatureSlot[]> {
  const configs = await prisma.authorityConfig.findMany({ where: { doc_type: docType }, orderBy: { slot: "asc" } });
  if (!configs.length) return [];

  const slots: SignatureSlot[] = [];
  for (const config of configs) {
    const signature = await prisma.authoritySignature.findFirst({ where: { role: config.authority_role, is_active: true } });
    if (signature) {
      slots.push({
        slot: config.slot,
        label: config.label,
        display_name: signature.display_name,
        designation: signature.designation,
        signature_url: signature.signature_url,
        seal_url: signature.seal_url,
      });
    }
  }
  return slots;
}

// Read-only check for the Signature Mapping admin page — never seeds a
// DocumentTemplate row (unlike getOrSeedActiveTemplate), just reports
// whether the doc type's active template (or its own default file, if no
// custom one has been activated yet) actually has a {{signatureBlock}}
// call anywhere. A custom card design's SIGNATURE-kind field box compiles
// down to this exact string (see compileCardDesign's fieldContent()), so
// checking for it covers both default and custom-designed templates.
export async function hasSignatureSlot(docType: DocumentType): Promise<boolean> {
  const existing = await prisma.documentTemplate.findFirst({ where: { doc_type: docType, is_active: true }, select: { html_content: true, is_default: true } });
  // A custom (admin-designed) active template is checked as-is; a
  // is_default:true row may be a stale snapshot from before a shipped
  // template file was updated (see getOrSeedActiveTemplate's matching
  // comment) — read the current file directly rather than report a
  // possibly-outdated cached answer.
  if (existing && !existing.is_default) return existing.html_content.includes("signatureBlock");

  const slug = DOC_TYPE_SLUG[docType];
  if (!slug) return false;
  try {
    const html = readFileSync(join(DEFAULT_TEMPLATES_DIR, `${slug}.html`), "utf-8");
    return html.includes("signatureBlock");
  } catch {
    return false;
  }
}

async function getOrSeedActiveTemplate(docType: DocumentType): Promise<{ html_content: string; css_content: string | null; layout_json: unknown }> {
  const existing = await prisma.documentTemplate.findFirst({ where: { doc_type: docType, is_active: true } });
  const slug = DOC_TYPE_SLUG[docType];

  // is_default:true means this row IS the shipped default, not an admin
  // customization — it must track the file on disk, not freeze at
  // whatever the file happened to contain the first time this doc type
  // was ever generated. Without this, updating a default .html file (as
  // this session did to add signature slots) would silently never reach
  // any institution that had already generated that doc type even once.
  if (existing) {
    if (existing.is_default && slug) {
      const currentHtml = readFileSync(join(DEFAULT_TEMPLATES_DIR, `${slug}.html`), "utf-8");
      if (currentHtml !== existing.html_content) {
        return prisma.documentTemplate.update({ where: { id: existing.id }, data: { html_content: currentHtml } });
      }
    }
    return existing;
  }

  if (!slug) throw new Error(`No default template available for document type: ${docType}`);

  const html_content = readFileSync(join(DEFAULT_TEMPLATES_DIR, `${slug}.html`), "utf-8");
  const created = await prisma.documentTemplate.create({
    data: { doc_type: docType, name: `Default ${slug}`, html_content, css_content: null, is_default: true, is_active: true },
  });
  return created;
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

// BARCODE/QR fields in a layout_json design reference a data_path (via the
// matching FIELD_CATALOG descriptor) rather than embedding generation logic
// in the template itself — Handlebars helpers run synchronously, but
// QRCode.toDataURL is async, so every record's barcode/QR image is
// pre-computed here, once per record, before Handlebars ever compiles.
async function withBarcodeData(design: CardDesign, docType: DocumentType, dataList: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const descriptors = FIELD_CATALOG[docType] ?? [];
  const descByKey = new Map(descriptors.map((d) => [d.field_key, d]));
  const barcodeBoxes = [...design.faces.front, ...(design.faces.back ?? [])].filter((b) => b.kind === "BARCODE" || b.kind === "QR");
  if (!barcodeBoxes.length) return dataList;

  return Promise.all(
    dataList.map(async (data) => {
      const extra: Record<string, string> = {};
      for (const box of barcodeBoxes) {
        const path = descByKey.get(box.field_key)?.data_path;
        const value = path ? getByPath(data, path) : undefined;
        if (value) extra[`__barcode_${box.id}`] = await generateQrDataUrl(String(value));
      }
      return { ...data, ...extra };
    }),
  );
}

export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 160 });
}

export interface RenderOptions {
  pageSize?: "A4" | "A5" | "A3" | "ID_CARD" | "ID_CARD_PORTRAIT" | "BADGE" | "LETTER";
  orientation?: "portrait" | "landscape";
}

const PAGE_SIZE_TO_PUPPETEER: Record<string, { format?: "A4" | "A5" | "A3"; width?: string; height?: string }> = {
  A4: { format: "A4" },
  A5: { format: "A5" },
  A3: { format: "A3" },
  ID_CARD: { width: "85.6mm", height: "54mm" },
  ID_CARD_PORTRAIT: { width: `${SIZE_PRESETS.ID_CARD_PORTRAIT!.width_mm}mm`, height: `${SIZE_PRESETS.ID_CARD_PORTRAIT!.height_mm}mm` },
  BADGE: { width: `${SIZE_PRESETS.BADGE!.width_mm}mm`, height: `${SIZE_PRESETS.BADGE!.height_mm}mm` },
  LETTER: { width: `${SIZE_PRESETS.LETTER!.width_mm}mm`, height: `${SIZE_PRESETS.LETTER!.height_mm}mm` },
};

export async function renderDocument(docType: DocumentType, data: Record<string, unknown>, options?: RenderOptions): Promise<Buffer> {
  return renderDocumentBatch(docType, [data], options);
}

// Compiles the template once and renders every record's HTML into a single
// Puppeteer pass (page-break between records) instead of one browser launch
// per record — this is what makes bulk endpoints (all admit cards for a
// class, all marksheets, etc.) produce one genuine multi-page PDF.
export async function renderDocumentBatch(docType: DocumentType, dataList: Record<string, unknown>[], options?: RenderOptions): Promise<Buffer> {
  registerHelpers();

  const institution = await getInstitutionBranding();
  const template = await getOrSeedActiveTemplate(docType);
  const signatures = await getSignatureSlots(docType);
  const compiled = Handlebars.compile(template.html_content);

  // When the active template was built via the visual designer, its
  // layout_json is the source of truth for page size (overriding whatever
  // the caller's `options.pageSize` was) and drives barcode/QR pre-computation.
  const designResult = template.layout_json ? cardDesignSchema.safeParse(template.layout_json) : undefined;
  const design = designResult?.success ? designResult.data : undefined;
  if (design) {
    dataList = await withBarcodeData(design, docType, dataList);
    options = { ...options, pageSize: design.canvas.size_preset as RenderOptions["pageSize"] };
  }

  // Each default template is itself a full <html> document (its own <head>/
  // <style>). Chromium's HTML5 parser merges repeated <html>/<head>/<body>
  // start tags into the single real document instead of nesting them, so
  // concatenating N renders of the same template produces N identical style
  // blocks (harmless — same content) followed by N bodies in order.
  const pageBreak = `<div style="page-break-after: always;"></div>`;
  const overrideStyle = template.css_content ? `<style>${template.css_content}</style>` : "";
  const html = overrideStyle + dataList
    .map((data) => compiled({ ...data, institution, signatures }))
    .join(pageBreak);

  return renderHtmlToPdf(html, options);
}

export async function renderHtmlToPdf(html: string, options?: RenderOptions): Promise<Buffer> {
  const size: { format?: "A4" | "A5" | "A3"; width?: string; height?: string } =
    PAGE_SIZE_TO_PUPPETEER[options?.pageSize ?? "A4"] ?? { format: "A4" };

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    // --disable-dev-shm-usage: the standard, safe fix for exactly the class
    // of "Protocol error (Page.printToPDF): Printing failed" error found
    // live-verifying Plan Twenty (2026-08-08) against a genuinely large
    // single-document render (638 ID cards, one class-9 batch) -- Chromium's
    // default /dev/shm allocation is small and this makes it spill to disk
    // instead. A no-op where /dev/shm isn't the constraint, never a downside.
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    // Real gap found live-verifying Plan Twenty (2026-08-08): Puppeteer's
    // own default navigation timeout is 30s, applying to setContent()
    // regardless of whether the caller is an HTTP request or a background
    // job -- a genuinely large single-page render (e.g. 638 ID cards in one
    // HTML document, this institution's real class-9 size) can legitimately
    // take longer than that to finish loading, and previously failed with
    // "Timed out after waiting 30000ms" even from inside documentQueue's
    // worker, which has no HTTP client waiting on it and no reason to cap
    // at 30s. Raised, not removed -- a normal-sized render that already
    // finishes in seconds is completely unaffected either way.
    page.setDefaultTimeout(120_000);
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      ...size,
      printBackground: true,
      landscape: options?.orientation === "landscape",
      margin: size.format ? { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" } : undefined,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// For internal ops reports that aren't backed by a customizable DocumentType
// template (no AuthorityConfig/signature workflow needed) — still gets real
// institution branding + Puppeteer rendering, just skips the template DB lookup.
export async function renderSimpleReport(title: string, bodyHtml: string, options?: RenderOptions): Promise<Buffer> {
  const institution = await getInstitutionBranding();
  const html = `
    <html><head><meta charset="utf-8" />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      * { font-family: 'Noto Sans Bengali', Arial, sans-serif; box-sizing: border-box; }
      body { margin: 0; padding: 16px; font-size: 12px; }
      .report-header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid ${institution.primary_color}; padding-bottom: 8px; margin-bottom: 12px; }
      .report-header img { height: 48px; }
      .report-header h1 { font-size: 16px; margin: 0; color: ${institution.primary_color}; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
      th { background: #f2f2f2; }
    </style></head>
    <body>
      <div class="report-header">
        ${institution.logo_url ? `<img src="${institution.logo_url}" />` : ""}
        <div><h1>${institution.name_en}</h1><p style="margin:2px 0;">${title}</p></div>
      </div>
      ${bodyHtml}
    </body></html>`;
  return renderHtmlToPdf(html, options);
}
