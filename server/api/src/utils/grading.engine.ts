export interface GradeRangeLike {
  min_marks: number;
  max_marks: number;
  grade_letter: string;
  grade_point: number;
}

export interface GradeResult {
  grade_letter: string;
  grade_point: number;
  remarks?: string | null;
}

export function calculateGrade(marks: number, isAbsent: boolean, scale: GradeRangeLike[]): GradeResult {
  if (isAbsent) return { grade_letter: "Ab", grade_point: 0 };

  const match = scale.find((r) => marks >= r.min_marks && marks <= r.max_marks);
  if (match) return { grade_letter: match.grade_letter, grade_point: match.grade_point };

  // marks outside every configured range (e.g. above the top band's max due
  // to rounding) — clamp to the highest/lowest band rather than erroring.
  const sorted = [...scale].sort((a, b) => a.min_marks - b.min_marks);
  if (sorted.length === 0) return { grade_letter: "N/A", grade_point: 0 };
  const highest = sorted[sorted.length - 1]!;
  const lowest = sorted[0]!;
  if (marks > highest.max_marks) return { grade_letter: highest.grade_letter, grade_point: highest.grade_point };
  return { grade_letter: lowest.grade_letter, grade_point: lowest.grade_point };
}

export interface SubjectMarkInput {
  subject_id: string;
  subject_name: string;
  is_optional: boolean;
  // Explicit, per-student choice (StudentSubject.is_fourth_subject) of
  // which ONE optional subject is this student's BD "4th subject" — never
  // auto-inferred (e.g. by picking the lowest- or highest-scoring optional),
  // since the real decision is made at enrollment time. A student may take
  // more than one optional subject; any that isn't flagged here is graded
  // like an ordinary subject, fully counted in the average.
  is_fourth_subject: boolean;
  marks_total: number | null;
  is_absent: boolean;
}

export interface SubjectResult {
  subject_id: string;
  subject_name: string;
  marks_total: number | null;
  grade_letter: string;
  grade_point: number;
  is_fourth_subject: boolean;
}

export interface StudentResult {
  subjects: SubjectResult[];
  total_gpa: number;
  overall_grade_letter: string;
  has_failed: boolean;
}

/**
 * BD SSC/HSC "4th subject" rule: the designated 4th subject is excluded
 * from the averaging denominator entirely — instead, max(grade_point - 2.00,
 * 0) from it is ADDED to the numerator as a bonus. A weak or failing score
 * in the 4th subject never fails the overall result and never drags the
 * average down; it simply contributes no bonus. The bonus can raise GPA up
 * to 5.00 but never lowers it. Source: BD education-board GPA calculation
 * convention (SSC/HSC), verified via web research 2026-07-28.
 */
export function calculateStudentResult(
  entries: SubjectMarkInput[],
  scale: GradeRangeLike[],
  fourthSubjectRule: boolean,
): StudentResult {
  const graded: SubjectResult[] = entries.map((e) => {
    const g = calculateGrade(e.marks_total ?? 0, e.is_absent, scale);
    return {
      subject_id: e.subject_id,
      subject_name: e.subject_name,
      marks_total: e.marks_total,
      grade_letter: g.grade_letter,
      grade_point: g.grade_point,
      is_fourth_subject: fourthSubjectRule && e.is_fourth_subject,
    };
  });

  const fourthSubject = graded.find((g) => g.is_fourth_subject);
  // Every subject EXCEPT the designated 4th subject — ordinary compulsory
  // subjects, plus any OTHER optional subject the student takes that isn't
  // their designated pick (graded normally, no special treatment; only one
  // subject per student ever gets the bonus rule).
  const averaged = fourthSubject ? graded.filter((g) => g.subject_id !== fourthSubject.subject_id) : graded;

  const hasFailed = averaged.some((g) => g.grade_letter === "F" || g.grade_letter === "Ab");
  const bonus = fourthSubject ? Math.max(fourthSubject.grade_point - 2, 0) : 0;
  const rawGpa = averaged.length ? (averaged.reduce((sum, g) => sum + g.grade_point, 0) + bonus) / averaged.length : 0;
  const total_gpa = hasFailed ? 0 : Math.round(Math.min(5, rawGpa) * 100) / 100;
  const overall_grade_letter = hasFailed ? "F" : gpaToLetter(total_gpa, scale);

  return { subjects: graded, total_gpa, overall_grade_letter, has_failed: hasFailed };
}

function gpaToLetter(gpa: number, scale: GradeRangeLike[]): string {
  const sorted = [...scale].sort((a, b) => b.grade_point - a.grade_point);
  const match = sorted.find((r) => gpa >= r.grade_point);
  return match?.grade_letter ?? sorted[sorted.length - 1]?.grade_letter ?? "N/A";
}

export interface PositionInput {
  student_id: string;
  total_gpa: number;
  total_marks: number;
}

export interface PositionResult extends PositionInput {
  position: number;
}

// ── University SGPA/CGPA (Phase 25) ─────────────────────────────────
// Purely additive — never called from calculateStudentResult/
// calculatePositions above, which stay exactly as-is for school/college/
// madrasah grading.

export interface CourseGradeInput {
  course_id: string;
  credit_hours: number;
  marks_total: number | null;
  is_absent: boolean;
}

export interface CourseGradeResult {
  course_id: string;
  credit_hours: number;
  grade_letter: string;
  grade_point: number;
}

export interface SGPAResult {
  courses: CourseGradeResult[];
  sgpa: number;
  total_credit_hours: number;
}

/** One semester's course grades -> SGPA, credit-weighted (not a plain average). */
export function calculateSGPA(entries: CourseGradeInput[], scale: GradeRangeLike[]): SGPAResult {
  const courses: CourseGradeResult[] = entries.map((e) => {
    const g = calculateGrade(e.marks_total ?? 0, e.is_absent, scale);
    return { course_id: e.course_id, credit_hours: e.credit_hours, grade_letter: g.grade_letter, grade_point: g.grade_point };
  });

  const total_credit_hours = courses.reduce((sum, c) => sum + c.credit_hours, 0);
  const weightedSum = courses.reduce((sum, c) => sum + c.grade_point * c.credit_hours, 0);
  const sgpa = total_credit_hours > 0 ? Math.round((weightedSum / total_credit_hours) * 100) / 100 : 0;

  return { courses, sgpa, total_credit_hours };
}

export interface CGPACourseHistoryEntry {
  grade_point: number;
  credit_hours: number;
}

/**
 * Cumulative CGPA across a student's ENTIRE course history:
 * Σ(grade_point × credit_hours) / Σ(credit_hours).
 * Deliberately NOT an average of per-semester SGPAs — that silently gives
 * the wrong number whenever credit loads differ semester to semester.
 * Caller is responsible for only passing COMPLETED/FAILED enrollments
 * (in-progress/dropped/withdrawn courses have no final grade to weight).
 */
export function calculateCGPA(history: CGPACourseHistoryEntry[]): number {
  const total_credit_hours = history.reduce((sum, h) => sum + h.credit_hours, 0);
  if (total_credit_hours === 0) return 0;
  const weightedSum = history.reduce((sum, h) => sum + h.grade_point * h.credit_hours, 0);
  return Math.round((weightedSum / total_credit_hours) * 100) / 100;
}

/** Sort by GPA desc (tie-break: total marks desc); ties share a position, next rank skips. */
export function calculatePositions(results: PositionInput[]): PositionResult[] {
  const sorted = [...results].sort((a, b) => b.total_gpa - a.total_gpa || b.total_marks - a.total_marks);

  const ranked: PositionResult[] = [];
  let position = 0;
  let seen = 0;
  let prevKey: string | null = null;

  for (const r of sorted) {
    seen++;
    const key = `${r.total_gpa}:${r.total_marks}`;
    if (key !== prevKey) {
      position = seen;
      prevKey = key;
    }
    ranked.push({ ...r, position });
  }

  return ranked;
}
