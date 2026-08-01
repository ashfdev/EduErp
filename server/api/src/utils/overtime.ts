// Shared by the staff daily-attendance summary (attendance.routes.ts) and
// payroll calculation (payroll.routes.ts, Plan Fourteen Phase J) -- a
// single definition of "overtime" so the two surfaces can never silently
// disagree on how many hours a given day's punch data represents.
//
// shiftStart is needed, not just shiftEnd, to correctly anchor a shift that
// crosses midnight -- either a genuine overnight shift (22:00-06:00, where
// shiftEnd naturally lands on checkOut's own calendar date) or a normal day
// shift where the checkout itself spilled past midnight (09:00-17:00,
// checked out 01:00 the following day -- shiftEnd must be anchored to the
// PREVIOUS calendar day relative to checkOut, or it lands in the future and
// silently produces 0 instead of real overtime).
export function computeOvertime(checkOut: Date | null, shiftStartTime: string | undefined, shiftEndTime: string | undefined): number {
  if (!checkOut || !shiftStartTime || !shiftEndTime) return 0;

  const [startH, startM] = shiftStartTime.split(":").map(Number);
  const [endH, endM] = shiftEndTime.split(":").map(Number);

  const shiftStart = new Date(checkOut);
  shiftStart.setHours(startH ?? 0, startM ?? 0, 0, 0);

  const shiftEnd = new Date(checkOut);
  shiftEnd.setHours(endH ?? 0, endM ?? 0, 0, 0);

  // A shift whose end-of-day clock time is at or before its own start-of-day
  // clock time is, by construction, a genuine overnight shift (22:00-06:00)
  // -- shiftEnd already correctly lands on checkOut's own calendar date in
  // that case, no adjustment needed.
  const isOvernightShift = shiftEnd.getTime() <= shiftStart.getTime();

  if (!isOvernightShift && checkOut.getTime() < shiftStart.getTime()) {
    // A normal (non-overnight) shift, but checkOut's clock time is earlier
    // than the shift's own start time -- checkOut has spilled past midnight
    // relative to the day the shift actually started. Both shiftStart and
    // shiftEnd were built on checkOut's date, which is really "the next
    // day" relative to the shift -- roll shiftEnd back one day so the
    // comparison is anchored to the shift's actual start day.
    shiftEnd.setDate(shiftEnd.getDate() - 1);
  }

  const diffHours = (checkOut.getTime() - shiftEnd.getTime()) / 3_600_000;
  return diffHours > 0 ? Math.round(diffHours * 100) / 100 : 0;
}
