import type { Prisma, PrismaClient } from "@education-erp/db";

type Tx = Prisma.TransactionClient | PrismaClient;

// Date.UTC(), not a local-time Date constructor — this server runs in
// Bangladesh time (UTC+6), and a locally-constructed midnight Date shifts
// back one calendar day once compared against a @db.Date column (the same
// bug fixed repeatedly elsewhere in this project). Extracts the calendar
// day via local getters (the institution's actual intended day) then
// reconstructs at UTC midnight.
export function toUtcDate(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function eachUtcDay(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += 86_400_000) days.push(new Date(t));
  return days;
}

// Every subject-teacher who has at least one scheduled RoutineSlot period
// with this student anywhere within [fromDate, toDate] (Plan Thirteen,
// Phase J, Mode B) — confirmed with the owner directly: each such teacher
// approves ONCE for the whole request, not once per day or once per
// subject, so this returns distinct teacher_ids only.
export async function resolveRequiredApproverTeacherIds(tx: Tx, studentId: string, fromDate: Date, toDate: Date): Promise<string[]> {
  const student = await tx.student.findUnique({ where: { id: studentId }, select: { current_section_id: true, group_id: true } });
  if (!student?.current_section_id) return [];

  const weekdays = [...new Set(eachUtcDay(fromDate, toDate).map((d) => d.getUTCDay()))];
  const enrolled = await tx.studentSubject.findMany({ where: { student_id: studentId }, select: { subject_id: true } });
  const subjectIds = enrolled.map((s) => s.subject_id);
  if (!subjectIds.length) return [];

  const slots = await tx.routineSlot.findMany({
    where: {
      section_id: student.current_section_id,
      day_of_week: { in: weekdays },
      subject_id: { in: subjectIds },
      teacher_id: { not: null },
      // Mirrors the same "group null = whole class" convention used
      // throughout this schema (Subject.group_id, RoutineSlot.group_id) —
      // a group-restricted slot only counts if it's this student's own
      // group.
      ...(student.group_id ? { OR: [{ group_id: null }, { group_id: student.group_id }] } : { group_id: null }),
    },
    select: { teacher_id: true },
  });

  return [...new Set(slots.map((s) => s.teacher_id!))];
}

// Writes SubjectAttendance{status:"LEAVE"} for every period this specific
// teacher teaches this student within [fromDate, toDate] — called once per
// teacher, immediately on THEIR own approval (not deferred until every
// teacher decides), so a teacher's own classes reflect the excused absence
// as soon as they act, regardless of how many co-approvers are still
// pending. Deliberately the one place in this codebase that writes
// SubjectAttendance LEAVE — the manual marking UI stays PRESENT/ABSENT/
// LATE-only, unchanged.
export async function writeSubjectLeaveForTeacher(tx: Tx, studentId: string, teacherId: string, fromDate: Date, toDate: Date): Promise<void> {
  const student = await tx.student.findUnique({ where: { id: studentId }, select: { current_section_id: true, group_id: true } });
  if (!student?.current_section_id) return;

  const days = eachUtcDay(fromDate, toDate);
  const weekdays = [...new Set(days.map((d) => d.getUTCDay()))];
  const enrolled = await tx.studentSubject.findMany({ where: { student_id: studentId }, select: { subject_id: true } });
  const subjectIds = enrolled.map((s) => s.subject_id);

  const slots = await tx.routineSlot.findMany({
    where: {
      section_id: student.current_section_id,
      teacher_id: teacherId,
      day_of_week: { in: weekdays },
      subject_id: { in: subjectIds },
      ...(student.group_id ? { OR: [{ group_id: null }, { group_id: student.group_id }] } : { group_id: null }),
    },
    select: { subject_id: true, period_no: true, day_of_week: true },
  });

  for (const day of days) {
    for (const slot of slots.filter((s) => s.day_of_week === day.getUTCDay())) {
      await tx.subjectAttendance.upsert({
        where: { student_id_subject_id_date_period_no: { student_id: studentId, subject_id: slot.subject_id!, date: day, period_no: slot.period_no } },
        update: { status: "LEAVE" },
        create: { student_id: studentId, subject_id: slot.subject_id!, section_id: student.current_section_id, date: day, period_no: slot.period_no, status: "LEAVE" },
      });
    }
  }
}

// Undoes any SubjectAttendance LEAVE rows this request may have already
// written via earlier-approving teachers, before the whole request gets
// rejected by a later one — safe because LEAVE is only ever written to
// SubjectAttendance through this one pathway (see writeSubjectLeaveForTeacher
// above), so there's no risk of deleting a real manually-marked LEAVE row.
export async function revertSubjectLeave(tx: Tx, studentId: string, fromDate: Date, toDate: Date): Promise<void> {
  await tx.subjectAttendance.deleteMany({ where: { student_id: studentId, date: { gte: fromDate, lte: toDate }, status: "LEAVE" } });
}

// Mode A (CLASS_TEACHER_ONLY) writeback — mirrors hr/leave.routes.ts's own
// staff-approval day-walking pattern exactly, but respects the
// institution's real configured working_days instead of hardcoding Friday.
export async function writeDailyLeaveForStudent(tx: Tx, studentId: string, fromDate: Date, toDate: Date, markedById: string): Promise<void> {
  const rules = await tx.attendanceRules.findUnique({ where: { id: "singleton" } });
  const workingDays = (rules?.working_days as number[] | null) ?? [0, 1, 2, 3, 4, 6];

  for (const day of eachUtcDay(fromDate, toDate)) {
    if (!workingDays.includes(day.getUTCDay())) continue;
    const existing = await tx.attendanceRecord.findFirst({ where: { person_id: studentId, person_type: "STUDENT", date: day, shift_id: null, period_no: null } });
    if (existing) {
      await tx.attendanceRecord.update({ where: { id: existing.id }, data: { status: "LEAVE" } });
    } else {
      await tx.attendanceRecord.create({ data: { person_id: studentId, person_type: "STUDENT", date: day, status: "LEAVE", source: "MANUAL", marked_by_id: markedById } });
    }
  }
}
