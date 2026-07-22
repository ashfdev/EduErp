import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { SUBJECT_ATTENDANCE_MARK_ROLES, STAFF_ONLY_ROLES } from "../../lib/roles";
import { markSubjectAttendanceSchema } from "@education-erp/validators";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { hasSubjectTeacherAssignment } from "../../lib/subject-teacher-assignment";
import { computeSubjectWiseAttendance } from "../../utils/subject-attendance";
import { reqParam } from "../../lib/req-param";

// Strict, no class-teacher-any-period fallback — confirmed directly with
// the product owner (Plan Twelve, decision #2): only a staff member with a
// real SubjectTeacherAssignment for this exact subject+section may mark
// this period. This is deliberately NOT the same as attendance.routes.ts's
// assertSectionOwnership() (which does let a class teacher mark anything in
// their own homeroom) — that broader allowance stays exactly as-is for the
// old daily/campus route and does not carry over here.
async function assertSubjectSectionOwnership(userId: string, role: string, subjectId: string, sectionId: string) {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return;
  const has = await hasSubjectTeacherAssignment(userId, subjectId, sectionId);
  if (!has) throw forbidden("You are not assigned to teach this subject in this section");
}

// Deliberately Date.UTC(), not `new Date(local Y, M, D)` — this server runs
// in Bangladesh time (UTC+6), and a locally-constructed midnight Date
// serializes to the *previous* UTC calendar day once Prisma sends it to a
// `@db.Date` column, silently storing every date one day earlier than
// intended (confirmed empirically while building this route: marking
// "2026-07-27" stored as 2026-07-26). Extracting Y/M/D via the local
// getters (correct — that's the institution's actual calendar day) and
// then reconstructing with Date.UTC() keeps the calendar day the human
// intended, regardless of server timezone.
function startOfDay(d: Date) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

// Ground-truth "who's actually enrolled in this subject" — same
// StudentSubject-driven pattern the marks-entry grid already uses, so an
// elective/group-restricted subject's roster never shows a student who
// never chose it. Scoped to the active academic year so a stale prior-year
// enrollment row can't leak a student into a roster they're not in anymore.
async function resolveEnrolledStudentIds(sectionId: string, groupId: string | null, subjectId: string): Promise<Set<string>> {
  const activeYear = await prisma.academicYear.findFirst({ where: { is_active: true } });
  const students = await prisma.student.findMany({
    where: {
      current_section_id: sectionId,
      status: "ACTIVE",
      deleted_at: null,
      ...(groupId ? { group_id: groupId } : {}),
      student_subjects: { some: { subject_id: subjectId, ...(activeYear ? { academic_year_id: activeYear.id } : {}) } },
    },
    select: { id: true },
  });
  return new Set(students.map((s) => s.id));
}

export const subjectAttendanceRouter = Router();
subjectAttendanceRouter.use(authenticate);

subjectAttendanceRouter.get(
  "/roster",
  authorize(SUBJECT_ATTENDANCE_MARK_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ routine_slot_id: z.string().min(1), date: z.coerce.date() }).parse(req.query);

    const slot = await prisma.routineSlot.findUnique({
      where: { id: query.routine_slot_id },
      include: {
        class: { select: { id: true, name_en: true } },
        section: { select: { id: true, name: true } },
        subject: { select: { id: true, name_en: true } },
        group: { select: { id: true, name_en: true } },
      },
    });
    if (!slot) throw notFound("Routine slot not found");
    if (!slot.subject_id || !slot.section_id) throw badRequest("This routine slot has no subject/section configured yet");

    await assertSubjectSectionOwnership(req.user!.sub, req.user!.role, slot.subject_id, slot.section_id);

    const date = startOfDay(query.date);
    const [students, existing] = await Promise.all([
      prisma.student.findMany({
        where: {
          current_section_id: slot.section_id,
          status: "ACTIVE",
          deleted_at: null,
          ...(slot.group_id ? { group_id: slot.group_id } : {}),
          student_subjects: { some: { subject_id: slot.subject_id } },
        },
        select: { id: true, name_en: true, current_roll_no: true, photo_url: true },
        orderBy: { current_roll_no: "asc" },
      }),
      prisma.subjectAttendance.findMany({
        where: { subject_id: slot.subject_id, section_id: slot.section_id, date, period_no: slot.period_no },
      }),
    ]);
    const existingByStudent = new Map(existing.map((e) => [e.student_id, e]));

    res.json({
      success: true,
      data: {
        slot: {
          id: slot.id,
          subject: slot.subject,
          class: slot.class,
          section: slot.section,
          group: slot.group,
          period_no: slot.period_no,
          start_time: slot.start_time,
          end_time: slot.end_time,
        },
        date: date.toISOString().slice(0, 10),
        students: students.map((s) => {
          const record = existingByStudent.get(s.id);
          return {
            id: s.id,
            name_en: s.name_en,
            current_roll_no: s.current_roll_no,
            photo_url: s.photo_url,
            existing: record ? { status: record.status, marked_by_id: record.marked_by_id, updated_at: record.updated_at } : null,
          };
        }),
      },
    });
  }),
);

subjectAttendanceRouter.post(
  "/mark",
  authorize(SUBJECT_ATTENDANCE_MARK_ROLES),
  asyncHandler(async (req, res) => {
    const body = markSubjectAttendanceSchema.parse(req.body);

    const slot = await prisma.routineSlot.findUnique({ where: { id: body.routine_slot_id } });
    if (!slot) throw notFound("Routine slot not found");
    if (!slot.subject_id || !slot.section_id) throw badRequest("This routine slot has no subject/section configured yet");

    await assertSubjectSectionOwnership(req.user!.sub, req.user!.role, slot.subject_id, slot.section_id);

    const date = startOfDay(body.date);
    if (date.getDay() !== slot.day_of_week) {
      throw badRequest("The given date's weekday doesn't match this routine slot's scheduled day");
    }

    const enrolledIds = await resolveEnrolledStudentIds(slot.section_id, slot.group_id, slot.subject_id);
    const notEnrolled = body.records.filter((r) => !enrolledIds.has(r.student_id));
    if (notEnrolled.length > 0) {
      throw badRequest(`${notEnrolled.length} student(s) in this request are not enrolled in this subject`);
    }

    for (const record of body.records) {
      await prisma.subjectAttendance.upsert({
        where: { student_id_subject_id_date_period_no: { student_id: record.student_id, subject_id: slot.subject_id, date, period_no: slot.period_no } },
        update: { status: record.status, marked_by_id: req.user!.sub, section_id: slot.section_id, routine_slot_id: slot.id },
        create: {
          student_id: record.student_id,
          subject_id: slot.subject_id,
          section_id: slot.section_id,
          routine_slot_id: slot.id,
          date,
          period_no: slot.period_no,
          status: record.status,
          marked_by_id: req.user!.sub,
        },
      });
    }

    res.json({ success: true, data: { saved: body.records.length } });
  }),
);

// Staff-facing per-subject breakdown for one student — same shared util the
// portal's own version uses (server/api/src/modules/portal/portal.routes.ts
// GET /student/:id/subject-attendance), so the two never drift apart.
subjectAttendanceRouter.get(
  "/student/:id/summary",
  authorize(STAFF_ONLY_ROLES),
  asyncHandler(async (req, res) => {
    const studentId = reqParam(req, "id");
    const query = z.object({ academic_year_id: z.string().optional() }).parse(req.query);

    let dateRange: { gte: Date; lte: Date } | undefined;
    if (query.academic_year_id) {
      const year = await prisma.academicYear.findUnique({ where: { id: query.academic_year_id } });
      if (!year) throw notFound("Academic year not found");
      dateRange = { gte: year.start_date, lte: year.end_date };
    } else {
      const activeYear = await prisma.academicYear.findFirst({ where: { is_active: true } });
      dateRange = activeYear ? { gte: activeYear.start_date, lte: activeYear.end_date } : undefined;
    }

    const summary = (await computeSubjectWiseAttendance(prisma, [studentId], dateRange)).get(studentId)!;
    const subjectIds = summary.subjects.map((s) => s.subject_id);
    const subjects = await prisma.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name_en: true } });
    const nameById = new Map(subjects.map((s) => [s.id, s.name_en]));

    res.json({
      success: true,
      data: {
        overall: summary.overall,
        subjects: summary.subjects
          .map((s) => ({ subject_id: s.subject_id, subject_name_en: nameById.get(s.subject_id) ?? "Unknown", present: s.present, total: s.total, percentage: s.percentage }))
          .sort((a, b) => a.subject_name_en.localeCompare(b.subject_name_en)),
      },
    });
  }),
);

// Day-by-day record for one subject — lazily called only when a staff
// member expands a subject on the student profile, same reasoning as the
// portal's equivalent route (never pull a whole year's per-date rows for
// every subject up front).
subjectAttendanceRouter.get(
  "/student/:id/subject/:subject_id/history",
  authorize(STAFF_ONLY_ROLES),
  asyncHandler(async (req, res) => {
    const studentId = reqParam(req, "id");
    const subjectId = reqParam(req, "subject_id");
    const query = z.object({ academic_year_id: z.string().optional() }).parse(req.query);

    let dateRange: { gte: Date; lte: Date } | undefined;
    if (query.academic_year_id) {
      const year = await prisma.academicYear.findUnique({ where: { id: query.academic_year_id } });
      if (!year) throw notFound("Academic year not found");
      dateRange = { gte: year.start_date, lte: year.end_date };
    } else {
      const activeYear = await prisma.academicYear.findFirst({ where: { is_active: true } });
      dateRange = activeYear ? { gte: activeYear.start_date, lte: activeYear.end_date } : undefined;
    }

    const records = await prisma.subjectAttendance.findMany({
      where: { student_id: studentId, subject_id: subjectId, ...(dateRange ? { date: dateRange } : {}) },
      select: { date: true, period_no: true, status: true },
      orderBy: { date: "desc" },
    });

    res.json({
      success: true,
      data: records.map((r) => ({ date: r.date.toISOString().slice(0, 10), period_no: r.period_no, status: r.status })),
    });
  }),
);
