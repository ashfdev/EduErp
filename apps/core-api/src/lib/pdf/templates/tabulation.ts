import { fontFaceCss } from '../fonts.js';

export interface TabulationRow {
  rollNo: string;
  studentUid: string;
  name: string;
  marksBySubject: Record<string, number | 'Ab'>;
  totalMarks: number;
  gpa: number;
  letterGrade: string;
  position: number | null;
}

export interface TabulationData {
  institution: { nameEn: string; nameBn?: string | null };
  exam: { name: string; academicYearLabel: string };
  className: string;
  sectionName: string;
  subjectNames: string[]; // column order
  rows: TabulationRow[];
}

// Print-ready notice-board sheet (PRD §7.5) — large font, whole class in one table.
export function buildTabulationHtml(data: TabulationData): string {
  const { institution, exam, className, sectionName, subjectNames, rows } = data;

  const headerCells = subjectNames.map((s) => `<th>${s}</th>`).join('');
  const bodyRows = rows
    .map(
      (r) => `
    <tr>
      <td>${r.rollNo}</td>
      <td style="text-align:left">${r.name}</td>
      ${subjectNames.map((s) => `<td>${r.marksBySubject[s] ?? '—'}</td>`).join('')}
      <td>${r.totalMarks}</td>
      <td>${r.gpa.toFixed(2)}</td>
      <td>${r.letterGrade}</td>
      <td>${r.position ?? '—'}</td>
    </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="utf-8" />
<style>
  ${fontFaceCss()}
  body { font-family: 'Noto Sans Bengali', Arial, sans-serif; margin: 0; }
  .header { text-align: center; margin-bottom: 12px; }
  .header h1 { margin: 0; font-size: 22px; }
  .header h2 { margin: 4px 0; font-size: 16px; font-weight: normal; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #333; padding: 4px 6px; text-align: center; }
  th { background: #eef2ff; }
</style>
</head>
<body>
  <div class="header">
    <h1>${institution.nameEn}${institution.nameBn ? ` / ${institution.nameBn}` : ''}</h1>
    <h2>${exam.name} (${exam.academicYearLabel}) — Class ${className} - ${sectionName} — Tabulation Sheet</h2>
  </div>
  <table>
    <thead>
      <tr><th>Roll</th><th>Name</th>${headerCells}<th>Total</th><th>GPA</th><th>Grade</th><th>Position</th></tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;
}
