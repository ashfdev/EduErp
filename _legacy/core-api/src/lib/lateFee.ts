/** Late-fee rule engine (gap-fix, PRD §10.1 "late fee rule: per-day fine after due date"). */
export function computeLateFee(dueDate: Date, lateFeePerDay: number | null, asOf: Date = new Date()): number {
  if (!lateFeePerDay || lateFeePerDay <= 0) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysOverdue = Math.floor((asOf.getTime() - dueDate.getTime()) / msPerDay);
  return daysOverdue > 0 ? daysOverdue * lateFeePerDay : 0;
}
