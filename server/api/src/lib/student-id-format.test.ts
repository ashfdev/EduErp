import { describe, expect, it } from "vitest";
import { formatStudentId, type StudentIdFormatInput } from "./student-id-format";

const FIXED_DATE = new Date("2026-09-15T00:00:00Z");

describe("formatStudentId", () => {
  it("generates prefix-year(2)-sequence with a dash separator", () => {
    const config: StudentIdFormatInput = { prefix: "ALh", include_year: true, year_format: "2", include_month: false, separator: "-", sequence_digits: 4 };
    expect(formatStudentId(config, 142, FIXED_DATE)).toBe("ALh-26-0142");
  });

  it("generates prefix-year(4)-sequence", () => {
    const config: StudentIdFormatInput = { prefix: "ASH", include_year: true, year_format: "4", include_month: false, separator: "-", sequence_digits: 5 };
    expect(formatStudentId(config, 1, FIXED_DATE)).toBe("ASH-2026-00001");
  });

  it("includes month when include_month is set", () => {
    const config: StudentIdFormatInput = { prefix: "ALh", include_year: true, year_format: "2", include_month: true, separator: "-", sequence_digits: 4 };
    expect(formatStudentId(config, 7, FIXED_DATE)).toBe("ALh-26-09-0007");
  });

  it("omits the year entirely when include_year is false", () => {
    const config: StudentIdFormatInput = { prefix: "DU", include_year: false, year_format: "2", include_month: false, separator: "-", sequence_digits: 3 };
    expect(formatStudentId(config, 5, FIXED_DATE)).toBe("DU-005");
  });

  it("respects a custom separator, including an empty string", () => {
    const config: StudentIdFormatInput = { prefix: "STU", include_year: true, year_format: "2", include_month: false, separator: "", sequence_digits: 4 };
    expect(formatStudentId(config, 3, FIXED_DATE)).toBe("STU260003");
  });

  it("zero-pads the sequence to the configured digit count without truncating a larger sequence", () => {
    const config: StudentIdFormatInput = { prefix: "STU", include_year: false, year_format: "2", include_month: false, separator: "-", sequence_digits: 3 };
    expect(formatStudentId(config, 12345, FIXED_DATE)).toBe("STU-12345");
  });
});
