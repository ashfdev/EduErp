import { describe, expect, it } from "vitest";
import { calculateGrade, calculateStudentResult, calculatePositions, type GradeRangeLike } from "./grading.engine";

const BD_BOARD: GradeRangeLike[] = [
  { min_marks: 80, max_marks: 100, grade_letter: "A+", grade_point: 5.0 },
  { min_marks: 70, max_marks: 79.99, grade_letter: "A", grade_point: 4.0 },
  { min_marks: 60, max_marks: 69.99, grade_letter: "A-", grade_point: 3.5 },
  { min_marks: 50, max_marks: 59.99, grade_letter: "B", grade_point: 3.0 },
  { min_marks: 40, max_marks: 49.99, grade_letter: "C", grade_point: 2.0 },
  { min_marks: 33, max_marks: 39.99, grade_letter: "D", grade_point: 1.0 },
  { min_marks: 0, max_marks: 32.99, grade_letter: "F", grade_point: 0.0 },
];

describe("calculateGrade — BD board boundaries", () => {
  it.each([
    [100, "A+", 5.0],
    [80, "A+", 5.0],
    [79.99, "A", 4.0],
    [70, "A", 4.0],
    [69.99, "A-", 3.5],
    [60, "A-", 3.5],
    [59.99, "B", 3.0],
    [50, "B", 3.0],
    [49.99, "C", 2.0],
    [40, "C", 2.0],
    [39.99, "D", 1.0],
    [33, "D", 1.0],
    [32.99, "F", 0.0],
    [0, "F", 0.0],
  ])("marks=%d -> %s (%d)", (marks, letter, point) => {
    const result = calculateGrade(marks, false, BD_BOARD);
    expect(result.grade_letter).toBe(letter);
    expect(result.grade_point).toBe(point);
  });

  it("marks an absent student as Ab regardless of marks", () => {
    expect(calculateGrade(90, true, BD_BOARD)).toEqual({ grade_letter: "Ab", grade_point: 0 });
  });
});

describe("calculateStudentResult — 4th subject rule", () => {
  // Bangla 80->A+(5.0), English 75->A(4.0), Math 90->A+(5.0), Higher Math
  // (designated 4th subject) 85->A+(5.0), Biology (plain optional, not the
  // 4th subject pick) 45->C(2.0).
  const entries = [
    { subject_id: "bangla", subject_name: "Bangla", is_optional: false, is_fourth_subject: false, marks_total: 80, is_absent: false },
    { subject_id: "english", subject_name: "English", is_optional: false, is_fourth_subject: false, marks_total: 75, is_absent: false },
    { subject_id: "math", subject_name: "Math", is_optional: false, is_fourth_subject: false, marks_total: 90, is_absent: false },
    { subject_id: "biology", subject_name: "Biology", is_optional: true, is_fourth_subject: false, marks_total: 45, is_absent: false },
    { subject_id: "higher-math", subject_name: "Higher Math", is_optional: true, is_fourth_subject: true, marks_total: 85, is_absent: false },
  ];

  it("applies the real BD formula: (sum of averaged subjects + max(4th subject point - 2, 0)) / count of averaged subjects", () => {
    const result = calculateStudentResult(entries, BD_BOARD, true);
    const fourth = result.subjects.find((s) => s.is_fourth_subject);
    expect(fourth?.subject_id).toBe("higher-math");
    // Averaged subjects: Bangla, English, Math, Biology (4 of them) — Higher
    // Math (the 4th subject) is excluded from the denominator entirely.
    const averaged = result.subjects.filter((s) => !s.is_fourth_subject);
    expect(averaged).toHaveLength(4);
    // Bonus from the 4th subject: A+ (5.0) - 2.00 = 3.00.
    // GPA = (5.0[bangla] + 4.0[english] + 5.0[math] + 2.0[biology] + 3.0[bonus]) / 4
    expect(result.total_gpa).toBeCloseTo((5.0 + 4.0 + 5.0 + 2.0 + 3.0) / 4, 2);
  });

  it("counts every subject with no bonus when the rule is disabled", () => {
    const result = calculateStudentResult(entries, BD_BOARD, false);
    expect(result.subjects.every((s) => !s.is_fourth_subject)).toBe(true);
    // Plain average of all 5 subjects, no bonus.
    expect(result.total_gpa).toBeCloseTo((5.0 + 4.0 + 5.0 + 2.0 + 5.0) / 5, 2);
  });

  it("floors the 4th-subject bonus at 0 when its grade point is 2.0 or below", () => {
    // Higher Math scores only 45 (C, 2.0) instead of 85 — bonus = max(2.0 -
    // 2.0, 0) = 0, so it contributes nothing, not a negative adjustment.
    const weakFourth = entries.map((e) => (e.subject_id === "higher-math" ? { ...e, marks_total: 45 } : e));
    const result = calculateStudentResult(weakFourth, BD_BOARD, true);
    expect(result.total_gpa).toBeCloseTo((5.0 + 4.0 + 5.0 + 2.0 + 0) / 4, 2);
  });

  it("does not fail the overall result when only the 4th subject fails", () => {
    // Higher Math scores 20 (F) — must not fail the whole result, and must
    // not drag the average down since it's excluded from the denominator.
    const failingFourth = entries.map((e) => (e.subject_id === "higher-math" ? { ...e, marks_total: 20 } : e));
    const result = calculateStudentResult(failingFourth, BD_BOARD, true);
    expect(result.has_failed).toBe(false);
    expect(result.total_gpa).toBeCloseTo((5.0 + 4.0 + 5.0 + 2.0 + 0) / 4, 2);
  });

  it("marks the overall result as failed if a non-4th-subject fails", () => {
    const withFail = entries.map((e) => (e.subject_id === "biology" ? { ...e, marks_total: 20 } : e));
    const result = calculateStudentResult(withFail, BD_BOARD, true);
    expect(result.has_failed).toBe(true);
    expect(result.total_gpa).toBe(0);
    expect(result.overall_grade_letter).toBe("F");
  });

  it("caps the bonus-boosted GPA at 5.00", () => {
    const allTop = entries.map((e) => ({ ...e, marks_total: 100 }));
    const result = calculateStudentResult(allTop, BD_BOARD, true);
    expect(result.total_gpa).toBe(5.0);
  });
});

describe("calculatePositions — tie handling", () => {
  it("assigns sequential positions when there are no ties", () => {
    const positions = calculatePositions([
      { student_id: "a", total_gpa: 5.0, total_marks: 480 },
      { student_id: "b", total_gpa: 4.5, total_marks: 450 },
      { student_id: "c", total_gpa: 4.0, total_marks: 400 },
    ]);
    expect(positions.map((p) => p.position)).toEqual([1, 2, 3]);
  });

  it("gives tied students the same position and skips the next rank", () => {
    const positions = calculatePositions([
      { student_id: "a", total_gpa: 5.0, total_marks: 480 },
      { student_id: "b", total_gpa: 5.0, total_marks: 480 },
      { student_id: "c", total_gpa: 4.0, total_marks: 400 },
    ]);
    const byId = Object.fromEntries(positions.map((p) => [p.student_id, p.position]));
    expect(byId.a).toBe(1);
    expect(byId.b).toBe(1);
    expect(byId.c).toBe(3);
  });

  it("breaks GPA ties using total marks", () => {
    const positions = calculatePositions([
      { student_id: "a", total_gpa: 5.0, total_marks: 470 },
      { student_id: "b", total_gpa: 5.0, total_marks: 490 },
    ]);
    const byId = Object.fromEntries(positions.map((p) => [p.student_id, p.position]));
    expect(byId.b).toBe(1);
    expect(byId.a).toBe(2);
  });
});
