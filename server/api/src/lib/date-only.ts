// Every "day boundary" used to filter or write a Prisma `@db.Date` column
// (AttendanceRecord.date, SubjectAttendance.date, Voucher.date, and any
// other model with a date-only field) MUST be constructed via Date.UTC(),
// never the plain local Date constructor (`new Date(year, month, day)`).
//
// Prisma serializes @db.Date values using the UTC calendar date of the JS
// Date's underlying instant, not its local calendar date. On a
// positive-UTC-offset server (this institution runs Asia/Dhaka, UTC+6),
// `new Date(y, m, d)` produces an instant 6 hours into the *previous* UTC
// day, which Prisma then reads back as that previous calendar date —
// confirmed directly against this project's real Prisma client: writing
// `new Date(2026, 6, 26)` (intending July 26) reads back from the database
// as July 25. This is a real, deterministic, every-single-time bug on this
// timezone, not an intermittent one.
//
// Use these helpers for any @db.Date comparison. For a plain DateTime field
// (Payment.paid_at, PayrollRecord.paid_at, LeaveRequest.from_date/to_date),
// the existing local-constructor pattern (`new Date(y, m, d)` used directly
// as a range boundary) is already correct and must NOT be swapped for this
// — a DateTime range filter needs the actual local-midnight *instant*, not
// a UTC-recalibrated one, and Date.UTC() would shift it 6 hours too late.

export function dateOnlyFromParts(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

// Re-anchors any Date to a correct @db.Date value, reading its LOCAL
// calendar fields (so a Date already representing "Dhaka calendar date X"
// — however it was constructed — always re-serializes as X, never X-1).
export function dateOnlyFrom(d: Date): Date {
  return dateOnlyFromParts(d.getFullYear(), d.getMonth(), d.getDate());
}

export function dateOnlyToday(): Date {
  return dateOnlyFrom(new Date());
}

export function dateOnlyDayRange(d: Date = new Date()): { start: Date; end: Date } {
  const start = dateOnlyFrom(d);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export function dateOnlyMonthRange(d: Date = new Date()): { start: Date; end: Date } {
  return {
    start: dateOnlyFromParts(d.getFullYear(), d.getMonth(), 1),
    end: dateOnlyFromParts(d.getFullYear(), d.getMonth() + 1, 1),
  };
}
