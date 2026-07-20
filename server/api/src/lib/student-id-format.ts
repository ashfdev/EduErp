export interface StudentIdFormatInput {
  prefix: string;
  include_year: boolean;
  year_format: "2" | "4";
  include_month: boolean;
  separator: string;
  sequence_digits: number;
}

// classSegment is only ever passed for CLASS-scoped sequencing (see
// generateStudentUID) — every other scope leaves it undefined and this
// function's output is byte-for-byte unchanged from before. It's what
// actually makes CLASS scope's per-class-restarting sequence numbers safe:
// without a class-identifying segment in the ID string itself, two
// different classes each restarting their own count at 1 would produce the
// identical formatted ID, colliding against student_uid's global
// uniqueness constraint.
export function formatStudentId(config: StudentIdFormatInput, sequence: number, date = new Date(), classSegment?: string): string {
  const parts: string[] = [config.prefix];

  if (config.include_year) {
    const year = date.getFullYear().toString();
    parts.push(config.year_format === "2" ? year.slice(-2) : year);
  }
  if (config.include_month) {
    parts.push(String(date.getMonth() + 1).padStart(2, "0"));
  }
  if (classSegment) {
    parts.push(classSegment);
  }
  parts.push(String(sequence).padStart(config.sequence_digits, "0"));

  return parts.join(config.separator);
}
