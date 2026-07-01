export type GradingScaleName = 'BD_BOARD' | 'CGPA_4' | 'CUSTOM';

interface GradeBand {
  min: number; // percentage, inclusive
  letter: string;
  gpa: number;
}

// Standard Bangladesh SSC/HSC board grading (also used for CGPA_5 and, until a
// band-editor exists, CUSTOM). Bands must stay sorted descending by `min`.
const BD_BOARD_BANDS: GradeBand[] = [
  { min: 80, letter: 'A+', gpa: 5.0 },
  { min: 70, letter: 'A', gpa: 4.0 },
  { min: 60, letter: 'A-', gpa: 3.5 },
  { min: 50, letter: 'B', gpa: 3.0 },
  { min: 40, letter: 'C', gpa: 2.0 },
  { min: 33, letter: 'D', gpa: 1.0 },
  { min: 0, letter: 'F', gpa: 0.0 },
];

// Common Bangladeshi university CGPA 4.0 scale (varies by university — this
// mirrors the widely-used National University pattern). Verify against the
// pilot institution's actual circular before relying on this for a real result.
const CGPA_4_BANDS: GradeBand[] = [
  { min: 80, letter: 'A+', gpa: 4.0 },
  { min: 75, letter: 'A', gpa: 3.75 },
  { min: 70, letter: 'A-', gpa: 3.5 },
  { min: 65, letter: 'B+', gpa: 3.25 },
  { min: 60, letter: 'B', gpa: 3.0 },
  { min: 55, letter: 'B-', gpa: 2.75 },
  { min: 50, letter: 'C+', gpa: 2.5 },
  { min: 45, letter: 'C', gpa: 2.25 },
  { min: 40, letter: 'D', gpa: 2.0 },
  { min: 0, letter: 'F', gpa: 0.0 },
];

function bandsFor(scale: GradingScaleName): GradeBand[] {
  return scale === 'CGPA_4' ? CGPA_4_BANDS : BD_BOARD_BANDS;
}

export function computeSubjectGrade(marksObtained: number, fullMarks: number, scale: GradingScaleName): { letter: string; gpaPoint: number } {
  const percentage = (marksObtained / fullMarks) * 100;
  const bands = bandsFor(scale);
  const band = bands.find((b) => percentage >= b.min) ?? bands[bands.length - 1]!;
  return { letter: band.letter, gpaPoint: band.gpa };
}

export interface SubjectResultInput {
  gpaPoint: number;
  isFourthSubject: boolean;
  isAbsent: boolean;
}

export interface OverallResult {
  gpa: number;
  letterGrade: string;
  hasFailed: boolean;
  failReason?: string;
}

/**
 * Applies the PRD §7.2 "4th-subject rule" (BD SSC/HSC standard): the additional
 * subject only contributes (gpa - 2) to the total when positive, and doesn't
 * count toward the divisor. This mirrors the commonly-cited board formula but
 * hasn't been checked against an official board circular — verify before using
 * for a real, disputable result (same caveat as the CGPA_4 bands above).
 */
export function computeOverallResult(subjects: SubjectResultInput[], scale: GradingScaleName, apply4thSubjectRule: boolean): OverallResult {
  if (subjects.length === 0) {
    return { gpa: 0, letterGrade: 'F', hasFailed: true, failReason: 'no subjects marked' };
  }
  if (subjects.some((s) => s.isAbsent)) {
    return { gpa: 0, letterGrade: 'F', hasFailed: true, failReason: 'absent in one or more subjects' };
  }

  const compulsory = apply4thSubjectRule ? subjects.filter((s) => !s.isFourthSubject) : subjects;
  const fourth = apply4thSubjectRule ? subjects.find((s) => s.isFourthSubject) : undefined;

  if (compulsory.some((s) => s.gpaPoint === 0)) {
    return { gpa: 0, letterGrade: 'F', hasFailed: true, failReason: 'failed a compulsory subject' };
  }

  let total = compulsory.reduce((sum, s) => sum + s.gpaPoint, 0);
  if (fourth && fourth.gpaPoint > 2) total += fourth.gpaPoint - 2;

  const gpa = Math.round((total / compulsory.length) * 100) / 100;
  const letterGrade = bandsFor(scale)
    .slice()
    .sort((a, b) => b.gpa - a.gpa)
    .find((b) => gpa >= b.gpa)?.letter ?? 'F';

  return { gpa, letterGrade, hasFailed: false };
}
