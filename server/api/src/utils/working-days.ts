// No Holiday-calendar model exists in the schema (a known, previously
// documented gap — see Phase 5/9 deferred items), so working days are
// derived purely from AttendanceRules.working_days_per_week: 6 excludes
// only Friday (BD single-weekly-holiday institutions), anything less
// excludes Friday + Saturday (the BD two-day-weekend convention).
export function workingDaysInMonth(year: number, month: number, workingDaysPerWeek: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(year, month - 1, day).getDay();
    const isFriday = dow === 5;
    const isSaturday = dow === 6;
    if (workingDaysPerWeek >= 6) {
      if (!isFriday) count++;
    } else {
      if (!isFriday && !isSaturday) count++;
    }
  }
  return count;
}
