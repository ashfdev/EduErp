export interface StudentIdFormatInput {
  prefix: string;
  include_year: boolean;
  year_format: "2" | "4";
  include_month: boolean;
  separator: string;
  sequence_digits: number;
}

export function formatStudentId(config: StudentIdFormatInput, sequence: number, date = new Date()): string {
  const parts: string[] = [config.prefix];

  if (config.include_year) {
    const year = date.getFullYear().toString();
    parts.push(config.year_format === "2" ? year.slice(-2) : year);
  }
  if (config.include_month) {
    parts.push(String(date.getMonth() + 1).padStart(2, "0"));
  }
  parts.push(String(sequence).padStart(config.sequence_digits, "0"));

  return parts.join(config.separator);
}
