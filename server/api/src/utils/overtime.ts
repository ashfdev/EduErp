// Shared by the staff daily-attendance summary (attendance.routes.ts) and
// payroll calculation (payroll.routes.ts, Plan Fourteen Phase J) -- a
// single definition of "overtime" so the two surfaces can never silently
// disagree on how many hours a given day's punch data represents.
export function computeOvertime(checkOut: Date | null, shiftEndTime: string | undefined): number {
  if (!checkOut || !shiftEndTime) return 0;
  const [h, m] = shiftEndTime.split(":").map(Number);
  const shiftEnd = new Date(checkOut);
  shiftEnd.setHours(h ?? 0, m ?? 0, 0, 0);
  const diffHours = (checkOut.getTime() - shiftEnd.getTime()) / 3_600_000;
  return diffHours > 0 ? Math.round(diffHours * 100) / 100 : 0;
}
