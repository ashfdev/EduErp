export interface GradeRangeInput {
  min_marks: number;
  max_marks: number;
  grade_letter: string;
}

export interface GradeRangeValidation {
  valid: boolean;
  errors: string[];
}

export function validateGradeRanges(ranges: GradeRangeInput[]): GradeRangeValidation {
  const errors: string[] = [];
  if (ranges.length === 0) {
    return { valid: false, errors: ["At least one grade range is required"] };
  }

  const sorted = [...ranges].sort((a, b) => a.min_marks - b.min_marks);

  if (sorted[0]!.min_marks !== 0) {
    errors.push(`Ranges must start at 0 (currently starts at ${sorted[0]!.min_marks})`);
  }
  const last = sorted[sorted.length - 1]!;
  if (last.max_marks !== 100) {
    errors.push(`Ranges must end at 100 (currently ends at ${last.max_marks})`);
  }

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    if (curr.min_marks < prev.max_marks) {
      errors.push(`Overlap between ${prev.grade_letter} and ${curr.grade_letter}`);
    } else if (curr.min_marks > prev.max_marks + 1) {
      errors.push(`Gap detected between ${prev.max_marks} and ${curr.min_marks}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

import type { GradeScaleType } from "@education-erp/types";

export interface GradeRangePresetEntry extends GradeRangeInput {
  grade_point: number;
  remarks: string;
  display_order: number;
}

export const GRADING_PRESETS: Record<string, { scale_type: GradeScaleType; ranges: GradeRangePresetEntry[] }> = {
  BD_BOARD: {
    scale_type: "GPA_5",
    ranges: [
      { min_marks: 80, max_marks: 100, grade_letter: "A+", grade_point: 5.0, remarks: "Excellent", display_order: 1 },
      { min_marks: 70, max_marks: 79.99, grade_letter: "A", grade_point: 4.0, remarks: "Very Good", display_order: 2 },
      { min_marks: 60, max_marks: 69.99, grade_letter: "A-", grade_point: 3.5, remarks: "Good", display_order: 3 },
      { min_marks: 50, max_marks: 59.99, grade_letter: "B", grade_point: 3.0, remarks: "Above Average", display_order: 4 },
      { min_marks: 40, max_marks: 49.99, grade_letter: "C", grade_point: 2.0, remarks: "Average", display_order: 5 },
      { min_marks: 33, max_marks: 39.99, grade_letter: "D", grade_point: 1.0, remarks: "Pass", display_order: 6 },
      { min_marks: 0, max_marks: 32.99, grade_letter: "F", grade_point: 0.0, remarks: "Fail", display_order: 7 },
    ],
  },
  CGPA_4: {
    scale_type: "GPA_4",
    ranges: [
      { min_marks: 90, max_marks: 100, grade_letter: "A+", grade_point: 4.0, remarks: "Excellent", display_order: 1 },
      { min_marks: 80, max_marks: 89.99, grade_letter: "A", grade_point: 3.7, remarks: "Very Good", display_order: 2 },
      { min_marks: 70, max_marks: 79.99, grade_letter: "B+", grade_point: 3.3, remarks: "Good", display_order: 3 },
      { min_marks: 60, max_marks: 69.99, grade_letter: "B", grade_point: 3.0, remarks: "Above Average", display_order: 4 },
      { min_marks: 50, max_marks: 59.99, grade_letter: "C", grade_point: 2.0, remarks: "Average", display_order: 5 },
      { min_marks: 40, max_marks: 49.99, grade_letter: "D", grade_point: 1.0, remarks: "Pass", display_order: 6 },
      { min_marks: 0, max_marks: 39.99, grade_letter: "F", grade_point: 0.0, remarks: "Fail", display_order: 7 },
    ],
  },
  CGPA_5: {
    scale_type: "GPA_5",
    ranges: [
      { min_marks: 80, max_marks: 100, grade_letter: "A+", grade_point: 5.0, remarks: "Excellent", display_order: 1 },
      { min_marks: 70, max_marks: 79.99, grade_letter: "A", grade_point: 4.0, remarks: "Very Good", display_order: 2 },
      { min_marks: 60, max_marks: 69.99, grade_letter: "A-", grade_point: 3.5, remarks: "Good", display_order: 3 },
      { min_marks: 50, max_marks: 59.99, grade_letter: "B", grade_point: 3.0, remarks: "Above Average", display_order: 4 },
      { min_marks: 40, max_marks: 49.99, grade_letter: "C", grade_point: 2.0, remarks: "Average", display_order: 5 },
      { min_marks: 33, max_marks: 39.99, grade_letter: "D", grade_point: 1.0, remarks: "Pass", display_order: 6 },
      { min_marks: 0, max_marks: 32.99, grade_letter: "F", grade_point: 0.0, remarks: "Fail", display_order: 7 },
    ],
  },
  PERCENTAGE: {
    scale_type: "PERCENTAGE",
    ranges: [{ min_marks: 0, max_marks: 100, grade_letter: "%", grade_point: 0, remarks: "", display_order: 1 }],
  },
};
