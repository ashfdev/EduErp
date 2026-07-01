import { fontFaceCss } from '../fonts.js';

export interface MarksheetData {
  institution: { nameEn: string; nameBn?: string | null; eiin?: string | null };
  student: { name: string; studentUid: string; rollNo?: string | null; className: string; sectionName: string };
  exam: { name: string; academicYearLabel: string };
  subjects: { nameEn: string; nameBn?: string | null; marksObtained: number | null; isAbsent: boolean; grade: string; fullMarks: number }[];
  result: { gpa: number; letterGrade: string; totalMarks: number; positionInClass?: number | null; hasFailed: boolean };
  qrDataUrl: string;
  verificationCode: string;
}

export function buildMarksheetHtml(data: MarksheetData): string {
  const { institution, student, exam, subjects, result, qrDataUrl, verificationCode } = data;

  const subjectRows = subjects
    .map(
      (s) => `
    <tr>
      <td>${s.nameEn}${s.nameBn ? ` / ${s.nameBn}` : ''}</td>
      <td style="text-align:center">${s.fullMarks}</td>
      <td style="text-align:center">${s.isAbsent ? 'Absent' : s.marksObtained}</td>
      <td style="text-align:center">${s.grade}</td>
    </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="utf-8" />
<style>
  ${fontFaceCss()}
  * { box-sizing: border-box; }
  body { font-family: 'Noto Sans Bengali', 'Helvetica Neue', Arial, sans-serif; padding: 0; margin: 0; color: #111; }
  .header { text-align: center; border-bottom: 3px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 16px; }
  .header h1 { margin: 0; font-size: 20px; }
  .header p { margin: 2px 0; font-size: 12px; color: #444; }
  .title { text-align: center; font-size: 16px; font-weight: bold; margin: 16px 0; text-decoration: underline; }
  .meta { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #999; padding: 6px 10px; }
  th { background: #eef2ff; }
  .summary { display: flex; justify-content: space-between; margin-top: 16px; font-size: 13px; }
  .result-badge { font-size: 18px; font-weight: bold; color: ${result.hasFailed ? '#b91c1c' : '#15803d'}; }
  .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 60px; font-size: 11px; }
  .signature-line { border-top: 1px solid #444; width: 160px; text-align: center; padding-top: 4px; }
  .qr-block { text-align: center; font-size: 9px; color: #666; }
</style>
</head>
<body>
  <div class="header">
    <h1>${institution.nameEn}${institution.nameBn ? ` / ${institution.nameBn}` : ''}</h1>
    <p>EIIN: ${institution.eiin ?? '—'}</p>
  </div>

  <div class="title">Marksheet — ${exam.name} (${exam.academicYearLabel})</div>

  <div class="meta">
    <div>
      <div><strong>Student:</strong> ${student.name}</div>
      <div><strong>Student ID:</strong> ${student.studentUid}</div>
    </div>
    <div>
      <div><strong>Class:</strong> ${student.className} - ${student.sectionName}</div>
      <div><strong>Roll:</strong> ${student.rollNo ?? '—'}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Subject</th><th>Full Marks</th><th>Obtained</th><th>Grade</th></tr>
    </thead>
    <tbody>
      ${subjectRows}
    </tbody>
  </table>

  <div class="summary">
    <div>Total Marks: <strong>${result.totalMarks}</strong></div>
    <div>Position in Class: <strong>${result.positionInClass ?? '—'}</strong></div>
    <div class="result-badge">GPA ${result.gpa.toFixed(2)} (${result.letterGrade})</div>
  </div>

  <div class="footer">
    <div class="signature-line">Class Teacher</div>
    <div class="signature-line">Exam Controller</div>
    <div class="signature-line">Principal</div>
    <div class="qr-block">
      <img src="${qrDataUrl}" width="70" height="70" /><br/>
      Verify: ${verificationCode}
    </div>
  </div>
</body>
</html>`;
}
