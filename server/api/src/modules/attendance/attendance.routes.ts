import { Router } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { ATTENDANCE_MARK_ROLES } from "../../lib/roles";
import { markAttendanceSchema, markStaffAttendanceSchema } from "@education-erp/validators";
import { sendNotification } from "../../services/notification.service";
import { badRequest } from "../../lib/errors";

export const attendanceRouter = Router();
attendanceRouter.use(authenticate);

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// NOTE: holiday-calendar validation is skipped — the given schema has no
// Holiday model (a genuine spec gap, not an oversight here). Real-time
// Socket.io emission on mark is also deferred; no socket server exists yet.
attendanceRouter.post(
  "/mark",
  authorize(ATTENDANCE_MARK_ROLES),
  asyncHandler(async (req, res) => {
    const body = markAttendanceSchema.parse(req.body);
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
    const date = startOfDay(body.date);

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

    const results = [];
    for (const s of students) {
      const records = await prisma.attendanceRecord.findMany({ where: { person_id: s.id, person_type: "STUDENT" } });
      if (!records.length) continue;
      const present = records.filter((r) => r.status === "PRESENT").length;
      const percentage = (present / records.length) * 100;
      if (percentage < threshold) {
        results.push({ ...s, attendance_percentage: Math.round(percentage * 10) / 10, total_days: records.length, present_days: present });
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
      prisma.student.findMany({ where: { current_section_id: query.section_id, deleted_at: null }, orderBy: { current_roll_no: "asc" } }),
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

    const students = await prisma.student.findMany({ where: { current_section_id: query.section_id, deleted_at: null }, orderBy: { current_roll_no: "asc" } });
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
    const students = await prisma.student.findMany({ where: { current_section_id: query.section_id, deleted_at: null }, orderBy: { current_roll_no: "asc" } });

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
        const students = await prisma.student.findMany({ where: { current_section_id: section.id, deleted_at: null }, orderBy: { current_roll_no: "asc" } });
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
