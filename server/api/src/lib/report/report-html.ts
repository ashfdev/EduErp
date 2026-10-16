import {
  brandColorHex,
  brandContactLine,
  formatDateOnly,
  formatDateTime,
  type ReportBranding,
  type ReportCell,
  type ReportColumn,
  type ReportSection,
  type ReportSpec,
} from "./report-spec";
import { DOCUMENT_FONT_STACK } from "../../services/document-fonts";

// Every value here is user data rendered by headless Chromium, so it must be escaped.
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeImageUrl(url: string | null): string | null {
  if (!url) return null;
  return /^(https?:\/\/|data:image\/)/i.test(url) ? url : null;
}

function formatCell<R>(column: ReportColumn<R>, value: ReportCell): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return column.type === "dateTime" ? formatDateTime(value) : formatDateOnly(value);
  if (typeof value === "number") {
    if (column.type === "percent") return `${value.toFixed(1)}%`;
    return value.toLocaleString("en-US");
  }
  return value;
}

function alignOf<R>(column: ReportColumn<R>): string {
  if (column.align) return column.align;
  if (column.type === "number" || column.type === "percent") return "right";
  if (column.type === "code" || column.type === "dateOnly" || column.type === "dateTime") return "center";
  return "left";
}

function renderSection<R>(spec: ReportSpec<R>, section: ReportSection<R>): string {
  const weights = section.columns.map((c) => c.width ?? 14);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const colgroup = weights.map((w) => `<col style="width:${((w / totalWeight) * 100).toFixed(2)}%">`).join("");
  const dense = section.columns.length > 14;

  const head = section.columns
    .map((c) => `<th style="text-align:${alignOf(c) === "right" ? "right" : "center"}">${escapeHtml(c.header).replace(/\n/g, "<br>")}</th>`)
    .join("");
  const body = section.rows.length
    ? section.rows
        .map((row, i) => {
          const cells = section.columns
            .map((c) => {
              const tone = c.tone?.(row);
              return `<td class="${tone ? `tone-${tone}` : ""}" style="text-align:${alignOf(c)}">${escapeHtml(formatCell(c, c.value(row, i)))}</td>`;
            })
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("")
    : `<tr><td class="empty" colspan="${section.columns.length}">No records match these filters.</td></tr>`;
  const foot =
    section.rows.length && section.columns.some((c) => c.total)
      ? `<tfoot><tr>${section.columns
          .map((c, i) => `<td style="text-align:${alignOf(c)}">${escapeHtml(c.total ? formatCell(c, c.total(section.rows)) : i === 0 ? "Total" : "")}</td>`)
          .join("")}</tr></tfoot>`
      : "";

  const stats = section.stats?.length
    ? `<div class="stats">${section.stats
        .map((s) => `<div class="stat ${s.tone ? `tone-${s.tone}` : ""}"><div class="stat-label">${escapeHtml(s.label)}</div><div class="stat-value">${escapeHtml(s.value)}</div></div>`)
        .join("")}</div>`
    : "";

  return `<section class="section">
    <div class="section-title">${escapeHtml(section.title)}${section.subtitle ? `<span>${escapeHtml(section.subtitle)}</span>` : ""}</div>
    ${stats}
    <table class="${dense ? "dense" : ""}"><colgroup>${colgroup}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>
  </section>`;
}

export function buildReportHtml<R>(spec: ReportSpec<R>, branding: ReportBranding, fontCss: string): string {
  const brand = `#${brandColorHex(branding.primary_color)}`;
  const logo = safeImageUrl(branding.logo_url);
  const contact = brandContactLine(branding);
  const generated = `Generated ${formatDateTime(spec.generatedAt ?? new Date())}${spec.generatedBy ? ` by ${spec.generatedBy}` : ""}`;
  const filters = spec.filters.map((f) => `<span class="chip"><b>${escapeHtml(f.label)}:</b> ${escapeHtml(f.value)}</span>`).join("");
  const legend = spec.legend?.length ? `<div class="legend">${spec.legend.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}</div>` : "";

  return `<!doctype html><html><head><meta charset="utf-8" />
<style>${fontCss}</style>
<style>
  * { box-sizing: border-box; font-family: ${DOCUMENT_FONT_STACK}; }
  body { margin: 0; padding: 0 2px; color: #0f172a; font-size: 10px; font-weight: 500; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .letterhead { display: flex; align-items: center; gap: 12px; padding-bottom: 10px; border-bottom: 3px solid ${brand}; }
  .letterhead img { height: 54px; width: 54px; object-fit: contain; }
  .letterhead h1 { margin: 0; font-size: 18px; color: ${brand}; line-height: 1.2; }
  .letterhead .bn { font-size: 12px; color: #334155; }
  .letterhead .contact { font-size: 8.5px; color: #64748b; margin-top: 2px; }
  .titlebar { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin: 12px 0 8px; }
  .titlebar h2 { margin: 0; font-size: 15px; letter-spacing: -0.01em; }
  .titlebar .generated { font-size: 8.5px; color: #64748b; white-space: nowrap; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
  .chip { font-size: 8.5px; padding: 2px 8px; border-radius: 999px; background: ${brand}14; border: 1px solid ${brand}33; color: #1e293b; }
  .section + .section { break-before: page; }
  .section-title { font-size: 12px; font-weight: 700; margin: 4px 0 8px; color: ${brand}; }
  .section-title span { font-weight: 400; color: #475569; margin-left: 6px; font-size: 10.5px; }
  .stats { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .stat { flex: 1 1 0; min-width: 70px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 8px; background: #f8fafc; }
  .stat-label { font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
  .stat-value { font-size: 14px; font-weight: 700; margin-top: 1px; }
  .stat.tone-good .stat-value { color: #15803d; } .stat.tone-bad .stat-value { color: #b91c1c; } .stat.tone-warn .stat-value { color: #b45309; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { background: ${brand}; color: #fff; font-weight: 600; font-size: 9px; padding: 6px 5px; border: 1px solid ${brand}; }
  td { padding: 5px; border: 1px solid #e2e8f0; font-size: 9.5px; overflow-wrap: anywhere; vertical-align: middle; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  tr { break-inside: avoid; }
  table.dense th { font-size: 7.5px; padding: 4px 1px; }
  table.dense td { font-size: 8px; padding: 3px 1px; }
  td.tone-good { color: #15803d; background: #dcfce7 !important; }
  td.tone-bad { color: #b91c1c; background: #fee2e2 !important; font-weight: 700; }
  td.tone-warn { color: #b45309; background: #fef3c7 !important; }
  td.tone-muted { color: #94a3b8; }
  td.empty { text-align: center; color: #64748b; font-style: italic; padding: 18px; }
  tfoot td { font-weight: 700; background: #f1f5f9; border-top: 2px solid ${brand}; }
  .legend { margin-top: 10px; font-size: 8.5px; color: #64748b; }
  .legend p { margin: 2px 0; }
</style></head><body>
  <header class="letterhead">
    ${logo ? `<img src="${escapeHtml(logo)}" alt="" />` : ""}
    <div>
      <h1>${escapeHtml(branding.name_en)}</h1>
      ${branding.name_bn ? `<div class="bn">${escapeHtml(branding.name_bn)}</div>` : ""}
      ${contact ? `<div class="contact">${escapeHtml(contact)}</div>` : ""}
    </div>
  </header>
  <div class="titlebar"><h2>${escapeHtml(spec.title)}</h2><div class="generated">${escapeHtml(generated)}</div></div>
  ${filters ? `<div class="chips">${filters}</div>` : ""}
  ${spec.sections.map((s) => renderSection(spec, s)).join("")}
  ${legend}
</body></html>`;
}
