import { Router } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { ATTENDANCE_MARK_ROLES, STAFF_ONLY_ROLES } from "../../lib/roles";
import { markAttendanceSchema, markStaffAttendanceSchema } from "@education-erp/validators";
import { sendNotification } from "../../services/notification.service";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { computeSubjectWiseAttendance } from "../../utils/subject-attendance";
import { computeOvertime } from "../../utils/overtime";
import { dateOnlyFrom } from "../../lib/date-only";

// CLASS_TEACHER/SUBJECT_TEACHER may only mark attendance for a section they're
// actually attached to — either as the section's class teacher, or via a
// SubjectTeacherAssignment covering this section (or the whole class, when
// section_id is null on the assignment). ADMIN/SUPER_ADMIN always bypass this
// entirely, matching marks.routes.ts's existing subject-ownership pattern.
async function assertSectionOwnership(userId: string, role: string, sectionId: string) {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return;

  const section = await prisma.section.findUnique({ where: { id: sectionId } });
  if (!section) throw notFound("Section not found");

  const staff = await prisma.staff.findFirst({ where: { user_id: userId } });
  if (staff && section.class_teacher_id === staff.id) return;

  const assignment = staff
    ? await prisma.subjectTeacherAssignment.findFirst({
        where: {
          staff_id: staff.id,
          OR: [{ section_id: sectionId }, { section_id: null }],
          subject: { class_id: section.class_id },
        },
      })
    : null;
  if (assignment) return;

  throw forbidden("You are not assigned to this section");
}

export const attendanceRouter = Router();
attendanceRouter.use(authenticate);
// Every GET route below previously had no role gate at all beyond
// authenticate — any authenticated token, including a STUDENT/GUARDIAN
// portal login, could call the institution-wide defaulters list, the bulk
// attendance Excel export, or any section's daily register directly.
// STAFF_ONLY_ROLES is a superset of ATTENDANCE_MARK_ROLES (the two POST
// routes' own narrower gate), so this floor doesn't change who can already
// mark attendance.
attendanceRouter.use(authorize(STAFF_ONLY_ROLES));

// Real, deterministic bug fix (not a defensive guess): this server runs in
// Bangladesh time (UTC+6), and Prisma serializes `@db.Date` columns
// (AttendanceRecord.date) using the UTC calendar date of a JS Date's
// underlying instant. The previous local-constructor version of this
// function shifted every write/filter one calendar day early, every single
// time — confirmed directly against this project's real Prisma client. See
// lib/date-only.ts for the full explanation.
function startOfDay(d: Date) {
  return dateOnlyFrom(d);
}

// NOTE: holiday-calendar validation is skipped — the given schema has no
// Holiday model (a genuine spec gap, not an oversight here). Real-time
// Socket.io emission on mark is also deferred; no socket server exists yet.
attendanceRouter.post(
  "/mark",
  authorize(ATTENDANCE_MARK_ROLES),
  asyncHandler(async (req, res) => {
    const body = markAttendanceSchema.parse(req.body);
    await assertSectionOwnership(req.user!.sub, req.user!.role, body.section_id);
    const date = startOfDay(body.date);

    const studentIds = body.records.map((r) => r.student_id);
    const biometricRecords = await prisma.attendanceRecord.findMany({
      where: { student_id: { in: studentIds }, date, source: "BIOMETRIC", ...(body.period_no != null ? { period_no: body.period_no } : {}) },
    });
    const biometricByStudent = new Map(biometricRecords.map((r) => [r.student_id, r]));

    const conflicts: { student_id: string; conflict_reason: string }[] = [];
    const toSave: typeof body.records = [];

    for (const record of body.records) {
      const biometric = biometricByStudent.get(record.student_id);
      if (biometric && biometric.status !== record.status && !record.override_reason) {
        conflicts.push({
          student_id: record.student_id,
          conflict_reason: `Biometric already recorded ${biometric.status}. Provide override_reason to replace it.`,
        });
        continue;
      }
      toSave.push(record);
    }

    let saved = 0;
    const absentStudentIds: string[] = [];

    // Prisma's compound-unique `where` shorthand rejects null members even
    // though shift_id/period_no are nullable columns — find-then-write
    // instead of upsert() so a missing shift/period doesn't break the match.
    for (const record of toSave) {
      const existing = await prisma.attendanceRecord.findFirst({
        where: {
          person_id: record.student_id,
          person_type: "STUDENT",
          date,
          shift_id: body.shift_id ?? null,
          period_no: body.period_no ?? null,
        },
      });

      if (existing) {
        await prisma.attendanceRecord.update({
          where: { id: existing.id },
          data: { status: record.status, source: "MANUAL", override_reason: record.override_reason, marked_by_id: req.user!.sub },
        });
      } else {
        await prisma.attendanceRecord.create({
          data: {
            person_id: record.student_id,
            person_type: "STUDENT",
            student_id: record.student_id,
            date,
            shift_id: body.shift_id,
            section_id: body.section_id,
            period_no: body.period_no,
            status: record.status,
            source: "MANUAL",
            marked_by_id: req.user!.sub,
            override_reason: record.override_reason,
          },
        });
      }
      saved++;
      if (record.status === "ABSENT") absentStudentIds.push(record.student_id);
    }

    const rules = await prisma.attendanceRules.findUnique({ where: { id: "singleton" } });
    if (rules?.sms_on_absent && absentStudentIds.length > 0) {
      const [absentStudents, institution] = await Promise.all([
        prisma.student.findMany({
          where: { id: { in: absentStudentIds } },
          select: { id: true, name_en: true, father_phone: true, guardian: { select: { user_id: true, email: true } } },
        }),
        prisma.institutionProfile.findFirst(),
      ]);
      for (const s of absentStudents) {
        await sendNotification({
          trigger: "ABSENCE",
          recipients: [{ name: s.name_en, phone: s.father_phone, email: s.guardian?.email, user_id: s.guardian?.user_id, person_id: s.id }],
          template_data: { student_name: s.name_en, date: date.toLocaleDateString(), school_phone: institution?.phone_primary ?? "" },
        });
      }
    }

    res.json({ success: true, data: { saved, conflicts } });
  }),
);

// Manual staff attendance — the only other writers of a STAFF AttendanceRecord
// are the biometric device bridge and leave-approval (LEAVE status only), so
// an institution with no biometric device for staff had no way to mark it.
attendanceRouter.post(
  "/staff/mark",
  authorize(ATTENDANCE_MARK_ROLES),
  asyncHandler(async (req, res) => {
    const body = markStaffAttendanceSchema.parse(req.body);
    // Date.UTC(), not the shared startOfDay() above (a known, previously-
    // flagged local-time Date bug elsewhere in this file, deliberately not
    // touched here — that function has 5 other call sites including the
    // actively-used student daily-attendance marking route, too much blast
    // radius to fix as a drive-by). Scoped fix: this one route now stores
    // under the correct calendar day, matching the new /staff/daily-summary
    // GET route's own Date.UTC()-based query — without this, a manual mark
    // silently saved under yesterday's date and never showed up today.
    const d = body.date;
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

    let saved = 0;
    for (const record of body.records) {
      const existing = await prisma.attendanceRecord.findFirst({
        where: { person_id: record.staff_id, person_type: "STAFF", date, shift_id: null, period_no: null },
      });

      if (existing) {
        await prisma.attendanceRecord.update({
          where: { id: existing.id },
          data: { status: record.status, source: "MANUAL", override_reason: record.override_reason, marked_by_id: req.user!.sub },
        });
      } else {
        await prisma.attendanceRecord.create({
          data: {
            person_id: record.staff_id,
            person_type: "STAFF",
            date,
            status: record.status,
            source: "MANUAL",
            marked_by_id: req.user!.sub,
            override_reason: record.override_reason,
          },
        });
      }
      saved++;
    }

    res.json({ success: true, data: { saved } });
  }),
);

// Employee Attendance admin page (Plan Thirteen, Phase E) — a pure read/
// aggregation endpoint. The underlying data is already correctly populated
// today, either by /staff/mark above or by the biometric punch pipeline
// (services/device/src/processor/punch.processor.ts resolves a punch to a
// Staff row via Staff.biometric_id using the exact same code path as
// students, including deriving check_in_at/check_out_at) — this route does
// not write any attendance data itself.
attendanceRouter.get(
  "/staff/daily-summary",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        date: z.coerce.date(),
        position: z.string().optional(),
        status: z.string().optional(),
      })
      .parse(req.query);

    // Date.UTC(), not startOfDay() above (which still uses a local-time Date
    // constructor) — this server runs in Bangladesh time (UTC+6), and a
    // locally-constructed midnight Date shifts back one calendar day once
    // compared against a @db.Date column. New code in this file uses the
    // correct pattern; startOfDay() itself is left as a known, previously-
    // flagged, out-of-scope pre-existing issue in this file.
    const d = query.date;
    const dayStart = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayEnd = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + 1));
    const dayOfWeek = dayStart.getUTCDay();

    const rules = await prisma.attendanceRules.findUnique({ where: { id: "singleton" } });
    const workingDays = (rules?.working_days as number[] | null) ?? [0, 1, 2, 3, 4, 6];
    const isWorkingDay = workingDays.includes(dayOfWeek);

    const staff = await prisma.staff.findMany({
      where: { deleted_at: null, is_active: true, ...(query.position && { designation: query.position }) },
      select: { id: true, name_en: true, designation: true },
      orderBy: { name_en: "asc" },
    });
    const staffIds = staff.map((s) => s.id);

    const [records, punchGroups] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: { person_id: { in: staffIds }, person_type: "STAFF", date: dayStart },
        include: { shift: { select: { start_time: true, end_time: true } } },
      }),
      prisma.devicePunchLog.groupBy({
        by: ["mapped_person_id"],
        where: { mapped_person_id: { in: staffIds }, mapped_person_type: "STAFF", punch_at: { gte: dayStart, lt: dayEnd } },
        _count: { _all: true },
      }),
    ]);
    const recordByStaff = new Map(records.map((r) => [r.person_id, r]));
    const punchCountByStaff = new Map(punchGroups.map((g) => [g.mapped_person_id, g._count._all]));

    function computeWorkingHours(checkIn: Date | null, checkOut: Date | null): number | null {
      if (!checkIn || !checkOut) return null;
      return Math.round(((checkOut.getTime() - checkIn.getTime()) / 3_600_000) * 100) / 100;
    }

    const rows = staff.map((s) => {
      const record = recordByStaff.get(s.id) ?? null;
      const rowStatus = !isWorkingDay ? "WEEKEND" : record ? record.status : "UNMARKED";
      return {
        staff_id: s.id,
        name: s.name_en,
        designation: s.designation,
        shift_start_time: record?.shift?.start_time ?? null,
        shift_end_time: record?.shift?.end_time ?? null,
        check_in_at: record?.check_in_at ?? null,
        check_out_at: record?.check_out_at ?? null,
        working_hours: computeWorkingHours(record?.check_in_at ?? null, record?.check_out_at ?? null),
        overtime_hours: computeOvertime(record?.check_out_at ?? null, record?.shift?.end_time),
        status: rowStatus,
        punch_count: punchCountByStaff.get(s.id) ?? 0,
      };
    });

    const filteredRows = query.status ? rows.filter((r) => r.status === query.status) : rows;

    const summary = {
      total: staff.length,
      present: rows.filter((r) => r.status === "PRESENT").length,
      late: rows.filter((r) => r.status === "LATE").length,
      absent: rows.filter((r) => r.status === "ABSENT").length,
      on_leave: rows.filter((r) => r.status === "LEAVE").length,
      weekend: rows.filter((r) => r.status === "WEEKEND").length,
      unmarked: rows.filter((r) => r.status === "UNMARKED").length,
    };

    res.json({ success: true, data: { date: dayStart.toISOString().slice(0, 10), is_working_day: isWorkingDay, summary, rows: filteredRows } });
  }),
);

attendanceRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z
      .object({ section_id: z.string().min(1), date: z.coerce.date(), shift_id: z.string().optional(), period_no: z.coerce.number().optional() })
      .parse(req.query);
    const date = startOfDay(query.date);

    const students = await prisma.student.findMany({
      where: { current_section_id: query.section_id, deleted_at: null, status: "ACTIVE" },
      select: { id: true, name_en: true, name_bn: true, current_roll_no: true, photo_url: true },
      orderBy: { current_roll_no: "asc" },
    });

    const records = await prisma.attendanceRecord.findMany({
      where: { section_id: query.section_id, date, ...(query.period_no != null ? { period_no: query.period_no } : {}) },
    });
    const byStudent = new Map(records.map((r) => [r.student_id, r]));

    const data = students.map((s) => {
      const record = byStudent.get(s.id);
      return {
        ...s,
        status: record?.status ?? null,
        source: record?.source ?? null,
        was_marked: !!record,
      };
    });

    res.json({ success: true, data });
  }),
);

attendanceRouter.get(
  "/student/:id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const query = z.object({ month: z.coerce.number().optional(), year: z.coerce.number().optional() }).parse(req.query);

    if (query.month != null && query.year != null) {
      const start = new Date(query.year, query.month - 1, 1);
      const end = new Date(query.year, query.month, 1);
      const records = await prisma.attendanceRecord.findMany({
        where: { person_id: id, person_type: "STUDENT", date: { gte: start, lt: end } },
        orderBy: { date: "asc" },
      });
      res.json({ success: true, data: { calendar: records.map((r) => ({ date: r.date, status: r.status, source: r.source })) } });
      return;
    }

    const all = await prisma.attendanceRecord.findMany({ where: { person_id: id, person_type: "STUDENT" } });
    const summary = {
      total_working_days: all.length,
      present: all.filter((a) => a.status === "PRESENT").length,
      absent: all.filter((a) => a.status === "ABSENT").length,
      late: all.filter((a) => a.status === "LATE").length,
      leave: all.filter((a) => a.status === "LEAVE").length,
      half_day: all.filter((a) => a.status === "HALF_DAY").length,
      percentage: all.length ? Math.round((all.filter((a) => a.status === "PRESENT").length / all.length) * 1000) / 10 : null,
    };

    const monthlyMap = new Map<string, { present: number; absent: number; late: number; total: number }>();
    for (const r of all) {
      const key = `${r.date.getFullYear()}-${r.date.getMonth() + 1}`;
      const bucket = monthlyMap.get(key) ?? { present: 0, absent: 0, late: 0, total: 0 };
      bucket.total++;
      if (r.status === "PRESENT") bucket.present++;
      if (r.status === "ABSENT") bucket.absent++;
      if (r.status === "LATE") bucket.late++;
      monthlyMap.set(key, bucket);
    }
    const monthly_summary = [...monthlyMap.entries()].map(([key, v]) => {
      const [year, month] = key.split("-").map(Number);
      return { year, month, ...v, percentage: v.total ? Math.round((v.present / v.total) * 1000) / 10 : null };
    });

    res.json({ success: true, data: { summary, monthly_summary } });
  }),
);

attendanceRouter.get(
  "/defaulters",
  asyncHandler(async (req, res) => {
    const query = z.object({ class_id: z.string().optional(), section_id: z.string().optional(), threshold: z.coerce.number().optional() }).parse(req.query);
    const rules = await prisma.attendanceRules.findUnique({ where: { id: "singleton" } });
    const threshold = query.threshold ?? rules?.min_attendance_percentage ?? 75;

    const students = await prisma.student.findMany({
      where: {
        deleted_at: null,
        status: "ACTIVE",
        ...(query.class_id && { current_class_id: query.class_id }),
        ...(query.section_id && { current_section_id: query.section_id }),
      },
      select: { id: true, name_en: true, student_uid: true, father_phone: true, current_class: { select: { name_en: true } }, current_section: { select: { name: true } } },
    });

    // Real subject-wise attendance (Plan Twelve), one batched query for the
    // whole roster instead of a per-student findMany().filter() loop —
    // subject-wise data is ~7x the row volume the old blanket
    // AttendanceRecord had, so the old pattern would only get worse here.
    const attendanceByStudent = await computeSubjectWiseAttendance(prisma, students.map((s) => s.id));

    const results = [];
    for (const s of students) {
      const summary = attendanceByStudent.get(s.id)!;
      if (!summary.overall.total) continue;
      if (summary.overall.percentage < threshold) {
        results.push({ ...s, attendance_percentage: summary.overall.percentage, total_days: summary.overall.total, present_days: summary.overall.present });
      }
    }

    res.json({ success: true, data: results });
  }),
);

attendanceRouter.get(
  "/daily-summary",
  asyncHandler(async (req, res) => {
    const query = z.object({ date: z.coerce.date(), class_id: z.string().optional() }).parse(req.query);
    const date = startOfDay(query.date);

    const classes = await prisma.class.findMany({
      where: { is_active: true, ...(query.class_id && { id: query.class_id }) },
      include: { students: { where: { deleted_at: null, status: "ACTIVE" }, select: { id: true } } },
    });

    const summary = await Promise.all(
      classes.map(async (c) => {
        const studentIds = c.students.map((s) => s.id);
        const records = await prisma.attendanceRecord.findMany({ where: { student_id: { in: studentIds }, date } });
        const present = records.filter((r) => r.status === "PRESENT").length;
        const absent = records.filter((r) => r.status === "ABSENT").length;
        const late = records.filter((r) => r.status === "LATE").length;
        return {
          class_id: c.id,
          class_name: c.name_en,
          total_students: studentIds.length,
          present,
          absent,
          late,
          percentage: studentIds.length ? Math.round((present / studentIds.length) * 1000) / 10 : null,
        };
      }),
    );

    res.json({ success: true, data: summary });
  }),
);

// ── Reports ──────────────────────────────────────────────────────
// Structured JSON now; PDF rendering is added on top of these in
// Phase 10 once the shared pdf.service.ts exists.

attendanceRouter.get(
  "/reports/daily-register",
  asyncHandler(async (req, res) => {
    const query = z.object({ date: z.coerce.date(), class_id: z.string().min(1), section_id: z.string().min(1) }).parse(req.query);
    const date = startOfDay(query.date);

    const [klass, section, students] = await Promise.all([
      prisma.class.findUnique({ where: { id: query.class_id } }),
      prisma.section.findUnique({ where: { id: query.section_id }, include: { shift: true, class_teacher: true } }),
      prisma.student.findMany({ where: { current_section_id: query.section_id, deleted_at: null, status: "ACTIVE" }, orderBy: { current_roll_no: "asc" } }),
    ]);

    const records = await prisma.attendanceRecord.findMany({ where: { section_id: query.section_id, date } });
    const byStudent = new Map(records.map((r) => [r.student_id, r.status]));

    res.json({
      success: true,
      data: {
        class: klass?.name_en,
        section: section?.name,
        shift: section?.shift?.name,
        teacher: section?.class_teacher?.name_en,
        date,
        rows: students.map((s) => ({ roll_no: s.current_roll_no, name_en: s.name_en, status: byStudent.get(s.id) ?? "UNMARKED" })),
      },
    });
  }),
);

attendanceRouter.get(
  "/reports/monthly-sheet",
  asyncHandler(async (req, res) => {
    const query = z.object({ class_id: z.string().min(1), section_id: z.string().min(1), month: z.coerce.number(), year: z.coerce.number() }).parse(req.query);
    const start = new Date(query.year, query.month - 1, 1);
    const end = new Date(query.year, query.month, 1);
    const daysInMonth = new Date(query.year, query.month, 0).getDate();

    const students = await prisma.student.findMany({ where: { current_section_id: query.section_id, deleted_at: null, status: "ACTIVE" }, orderBy: { current_roll_no: "asc" } });
    const records = await prisma.attendanceRecord.findMany({ where: { section_id: query.section_id, date: { gte: start, lt: end } } });

    const grid = students.map((s) => {
      const days: Record<number, string> = {};
      for (const r of records.filter((rec) => rec.student_id === s.id)) {
        days[r.date.getDate()] = r.status;
      }
      return { roll_no: s.current_roll_no, name_en: s.name_en, days };
    });

    res.json({ success: true, data: { days_in_month: daysInMonth, students: grid } });
  }),
);

attendanceRouter.get(
  "/reports/blank-sheet",
  asyncHandler(async (req, res) => {
    const query = z.object({ class_id: z.string().min(1), section_id: z.string().min(1), from_date: z.coerce.date(), to_date: z.coerce.date() }).parse(req.query);
    const students = await prisma.student.findMany({ where: { current_section_id: query.section_id, deleted_at: null, status: "ACTIVE" }, orderBy: { current_roll_no: "asc" } });

    const dates: string[] = [];
    for (let d = new Date(query.from_date); d <= query.to_date; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }

    res.json({ success: true, data: { dates, students: students.map((s) => ({ roll_no: s.current_roll_no, name_en: s.name_en })) } });
  }),
);

attendanceRouter.get(
  "/reports/bulk-export",
  asyncHandler(async (req, res) => {
    const query = z.object({ academic_year_id: z.string().min(1), month: z.coerce.number(), year: z.coerce.number(), class_id: z.string().optional() }).parse(req.query);
    const start = new Date(query.year, query.month - 1, 1);
    const end = new Date(query.year, query.month, 1);

    const classes = await prisma.class.findMany({
      where: { academic_year_id: query.academic_year_id, ...(query.class_id && { id: query.class_id }) },
      include: { sections: true },
    });
    if (!classes.length) throw badRequest("No classes found for this academic year");

    const workbook = new ExcelJS.Workbook();

    for (const klass of classes) {
      const sheet = workbook.addWorksheet(klass.name_en.slice(0, 31));
      sheet.columns = [
        { header: "Roll", key: "roll", width: 10 },
        { header: "Name", key: "name", width: 30 },
        { header: "Section", key: "section", width: 12 },
        { header: "Present", key: "present", width: 10 },
        { header: "Absent", key: "absent", width: 10 },
        { header: "Late", key: "late", width: 10 },
        { header: "%", key: "pct", width: 10 },
      ];

      for (const section of klass.sections) {
        const students = await prisma.student.findMany({ where: { current_section_id: section.id, deleted_at: null, status: "ACTIVE" }, orderBy: { current_roll_no: "asc" } });
        for (const s of students) {
          const records = await prisma.attendanceRecord.findMany({ where: { student_id: s.id, date: { gte: start, lt: end } } });
          const present = records.filter((r) => r.status === "PRESENT").length;
          const absent = records.filter((r) => r.status === "ABSENT").length;
          const late = records.filter((r) => r.status === "LATE").length;
          sheet.addRow({
            roll: s.current_roll_no,
            name: s.name_en,
            section: section.name,
            present,
            absent,
            late,
            pct: records.length ? Math.round((present / records.length) * 1000) / 10 : "",
          });
        }
      }
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Attendance_${query.month}_${query.year}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  }),
);
