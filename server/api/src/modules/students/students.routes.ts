import { Router } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { csvUpload } from "../../middleware/upload";
import { reqParam } from "../../lib/req-param";
import { STUDENT_CRUD_ROLES, STUDENT_PROMOTE_ROLES, STAFF_ONLY_ROLES } from "../../lib/roles";
import { createStudentSchema, updateStudentSchema, promoteStudentSchema, bulkPromoteSchema, graduateStudentSchema } from "@education-erp/validators";
import { generateStudentUID } from "../../utils/student-id.generator";
import { inheritSubjectsForClass } from "../../utils/subject-inheritance";
import { computeStudentLibraryFines } from "../library/library-fine.helper";
import { sendNotification } from "../../services/notification.service";
import { createOrLinkPortalLogin } from "../../lib/portal-login";
import { env } from "../../lib/env";
import { logAudit } from "../../lib/audit-log";
import { badRequest, notFound } from "../../lib/errors";

export const studentsRouter = Router();
// Full 360-degree profiles (incl. fees/results/attendance) for any given id
// with no per-record ownership check — staff-only. STUDENT/GUARDIAN reach
// their own data via the ownership-checked /api/portal/* routes instead.
studentsRouter.use(authenticate, authorize(STAFF_ONLY_ROLES));

const STUDENT_LIST_SELECT = {
  id: true,
  student_uid: true,
  name_en: true,
  name_bn: true,
  photo_url: true,
  current_roll_no: true,
  status: true,
  graduation_year: true,
  father_phone: true,
  current_class: { select: { id: true, name_en: true } },
  current_section: { select: { id: true, name: true } },
  guardian: { select: { phone: true } },
} as const;

studentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        search: z.string().optional(),
        class_id: z.string().optional(),
        section_id: z.string().optional(),
        status: z.string().optional(),
        gender: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);

    const where = {
      deleted_at: null,
      ...(query.class_id && { current_class_id: query.class_id }),
      ...(query.section_id && { current_section_id: query.section_id }),
      ...(query.status && { status: query.status as never }),
      ...(query.gender && { gender: query.gender as never }),
      ...(query.search && {
        OR: [
          { name_en: { contains: query.search, mode: "insensitive" as const } },
          { student_uid: { contains: query.search, mode: "insensitive" as const } },
          { current_roll_no: { contains: query.search, mode: "insensitive" as const } },
          { registration_no: { contains: query.search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.student.findMany({
        where,
        select: STUDENT_LIST_SELECT,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { created_at: "desc" },
      }),
      prisma.student.count({ where }),
    ]);

    res.json({
      success: true,
      data: items,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    });
  }),
);

// Registered before "/:id" — otherwise Express would match "export" as an id.
studentsRouter.get(
  "/export",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        search: z.string().optional(),
        class_id: z.string().optional(),
        section_id: z.string().optional(),
        status: z.string().optional(),
        gender: z.string().optional(),
      })
      .parse(req.query);

    const where = {
      deleted_at: null,
      ...(query.class_id && { current_class_id: query.class_id }),
      ...(query.section_id && { current_section_id: query.section_id }),
      ...(query.status && { status: query.status as never }),
      ...(query.gender && { gender: query.gender as never }),
      ...(query.search && {
        OR: [
          { name_en: { contains: query.search, mode: "insensitive" as const } },
          { student_uid: { contains: query.search, mode: "insensitive" as const } },
          { current_roll_no: { contains: query.search, mode: "insensitive" as const } },
          { registration_no: { contains: query.search, mode: "insensitive" as const } },
        ],
      }),
    };

    const students = await prisma.student.findMany({ where, select: STUDENT_LIST_SELECT, orderBy: { created_at: "desc" } });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Students");
    sheet.columns = [
      { header: "Student ID", key: "student_uid", width: 18 },
      { header: "Name", key: "name_en", width: 24 },
      { header: "Roll No", key: "roll_no", width: 12 },
      { header: "Class", key: "class_name", width: 16 },
      { header: "Section", key: "section_name", width: 12 },
      { header: "Status", key: "status", width: 12 },
      { header: "Guardian Phone", key: "guardian_phone", width: 16 },
    ];
    for (const s of students) {
      sheet.addRow({
        student_uid: s.student_uid,
        name_en: s.name_en,
        roll_no: s.current_roll_no ?? "",
        class_name: s.current_class?.name_en ?? "",
        section_name: s.current_section?.name ?? "",
        status: s.status,
        guardian_phone: s.guardian?.phone ?? s.father_phone ?? "",
      });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="Students.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  }),
);

studentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const student = await prisma.student.findFirst({
      where: { id, deleted_at: null },
      include: {
        guardian: true,
        current_class: true,
        current_section: true,
        academic_history: { include: { academic_year: true }, orderBy: { created_at: "desc" } },
        student_subjects: { include: { subject: true } },
        attendance: { orderBy: { date: "desc" }, take: 60 },
        mark_entries: { include: { exam: true, subject: true } },
        invoices: { include: { payments: true }, orderBy: { due_date: "desc" } },
      },
    });
    if (!student) throw notFound("Student not found");

    const subjectsWithTeacher = await Promise.all(
      student.student_subjects.map(async (ss) => {
        const assignment = await prisma.subjectTeacherAssignment.findFirst({
          where: { subject_id: ss.subject_id, section_id: student.current_section_id ?? undefined },
          include: { staff: { select: { name_en: true, designation: true } } },
        });
        return {
          subject_id: ss.subject_id,
          subject_name_en: ss.subject.name_en,
          subject_name_bn: ss.subject.name_bn,
          subject_code: ss.subject.code,
          subject_type: ss.subject.subject_type,
          is_compulsory: ss.subject.is_compulsory,
          is_inherited: ss.is_inherited,
          assigned_teacher: assignment?.staff ?? null,
        };
      }),
    );

    const presentCount = student.attendance.filter((a) => a.status === "PRESENT").length;
    const absentCount = student.attendance.filter((a) => a.status === "ABSENT").length;
    const lateCount = student.attendance.filter((a) => a.status === "LATE").length;

    const outstandingTotal = student.invoices.reduce((sum, inv) => sum + (inv.amount_due + inv.fine_amount - inv.amount_paid), 0);
    const paidTotal = student.invoices.reduce((sum, inv) => sum + inv.amount_paid, 0);

    const [libraryFines, transport, hostelAllocation] = await Promise.all([
      computeStudentLibraryFines(student.id),
      prisma.studentTransport.findUnique({ where: { student_id: student.id }, include: { route: { select: { name: true, fare: true } } } }),
      prisma.hostelAllocation.findFirst({ where: { student_id: student.id, is_active: true }, include: { room: { select: { room_no: true, block: { select: { name: true } } } } } }),
    ]);

    res.json({
      success: true,
      data: {
        personal: {
          id: student.id,
          student_uid: student.student_uid,
          name_en: student.name_en,
          name_bn: student.name_bn,
          date_of_birth: student.date_of_birth,
          gender: student.gender,
          religion: student.religion,
          blood_group: student.blood_group,
          nationality: student.nationality,
          phone: student.phone,
          photo_url: student.photo_url,
          address_permanent: student.address_permanent,
          address_current: student.address_current,
          district: student.district,
          has_disability: student.has_disability,
          disability_note: student.disability_note,
          status: student.status,
          guardian: student.guardian,
          father_name: student.father_name,
          father_phone: student.father_phone,
          mother_name: student.mother_name,
          mother_phone: student.mother_phone,
        },
        academic: {
          current: {
            class: student.current_class,
            section: student.current_section,
            roll_no: student.current_roll_no,
            registration_no: student.registration_no,
            board_roll: student.board_roll,
            admission_date: student.admission_date,
          },
          history: student.academic_history,
        },
        subjects: subjectsWithTeacher,
        attendance: {
          current_year_summary: {
            total_days: student.attendance.length,
            present: presentCount,
            absent: absentCount,
            late: lateCount,
            percentage: student.attendance.length ? Math.round((presentCount / student.attendance.length) * 1000) / 10 : null,
          },
        },
        results: student.mark_entries,
        fees: {
          invoices: student.invoices,
          outstanding_total: outstandingTotal,
          paid_total: paidTotal,
        },
        library: libraryFines,
        transport: transport ? { route_name: transport.route.name, fare: transport.route.fare, pickup_stop: transport.pickup_stop } : null,
        hostel: hostelAllocation ? { block_name: hostelAllocation.room.block.name, room_no: hostelAllocation.room.room_no, bed_no: hostelAllocation.bed_no } : null,
        discipline: [],
      },
    });
  }),
);

studentsRouter.post(
  "/",
  authorize(STUDENT_CRUD_ROLES),
  asyncHandler(async (req, res) => {
    const body = createStudentSchema.parse(req.body);

    const { student, studentLogin, guardianLogin, student_uid } = await prisma.$transaction(async (tx) => {
      let guardianId = body.guardian_id ?? null;
      let guardianLoginResult: Awaited<ReturnType<typeof createOrLinkPortalLogin>> | null = null;
      if (!guardianId && body.father_phone) {
        const existingGuardian = await tx.guardian.findFirst({ where: { phone: body.father_phone } });
        if (existingGuardian) {
          guardianId = existingGuardian.id;
        } else {
          // Guardians get a portal login too — the phone may already belong
          // to a User from an older sibling's guardian record, in which case
          // this links the new Guardian row to that existing account instead
          // of erroring or creating a duplicate.
          guardianLoginResult = await createOrLinkPortalLogin(tx, { role: "GUARDIAN", phone: body.father_phone, name: body.father_name ?? "Guardian" });
          const guardian = await tx.guardian.create({
            data: { user_id: guardianLoginResult.userId, name_en: body.father_name ?? "Guardian", relation: "FATHER", phone: body.father_phone },
          });
          guardianId = guardian.id;
        }
      }

      const student_uid = await generateStudentUID(body.current_class_id);
      const studentLoginResult = body.phone
        ? await createOrLinkPortalLogin(tx, { role: "STUDENT", phone: body.phone, name: body.name_en })
        : null;

      const created = await tx.student.create({
        data: {
          user_id: studentLoginResult?.userId,
          student_uid,
          name_en: body.name_en,
          name_bn: body.name_bn,
          date_of_birth: body.date_of_birth,
          gender: body.gender,
          religion: body.religion,
          blood_group: body.blood_group,
          nid_or_birth_reg: body.nid_or_birth_reg,
          phone: body.phone,
          guardian_id: guardianId,
          father_name: body.father_name,
          father_phone: body.father_phone,
          father_nid: body.father_nid,
          father_occupation: body.father_occupation,
          mother_name: body.mother_name,
          mother_phone: body.mother_phone,
          mother_nid: body.mother_nid,
          mother_occupation: body.mother_occupation,
          address_permanent: body.address_permanent,
          address_current: body.address_current,
          district: body.district,
          current_class_id: body.current_class_id,
          current_section_id: body.current_section_id,
          current_roll_no: body.current_roll_no,
          registration_no: body.registration_no,
          board_roll: body.board_roll,
          biometric_id: body.biometric_id,
          admission_date: body.admission_date ?? new Date(),
          previous_institution: body.previous_institution,
          previous_class: body.previous_class,
          previous_result: body.previous_result,
          has_disability: body.has_disability ?? false,
          disability_note: body.disability_note,
        },
      });

      await inheritSubjectsForClass(tx, created.id, body.current_class_id, body.academic_year_id, body.selected_optional_subject_ids);

      return { student: created, studentLogin: studentLoginResult, guardianLogin: guardianLoginResult, student_uid };
    });

    if (body.send_portal_login_sms !== false) {
      if (body.father_phone) {
        await sendNotification({
          trigger: "ADMISSION_CONFIRM",
          recipients: [{ name: body.father_name ?? "Guardian", phone: body.father_phone }],
          template_data: { student_name: body.name_en, student_uid },
        });
      }
      if (guardianLogin?.tempPassword && body.father_phone) {
        await sendNotification({
          trigger: "PORTAL_LOGIN_CREATED",
          recipients: [{ name: body.father_name ?? "Guardian", phone: body.father_phone }],
          template_data: { name: body.father_name ?? "Guardian", phone: body.father_phone, password: guardianLogin.tempPassword, portal_url: env.PORTAL_URL ?? "" },
        });
      }
      if (studentLogin?.tempPassword && body.phone) {
        await sendNotification({
          trigger: "PORTAL_LOGIN_CREATED",
          recipients: [{ name: body.name_en, phone: body.phone }],
          template_data: { name: body.name_en, phone: body.phone, password: studentLogin.tempPassword, portal_url: env.PORTAL_URL ?? "" },
        });
      }
    }

    res.status(201).json({ success: true, data: student });
  }),
);

studentsRouter.put(
  "/:id",
  authorize(STUDENT_CRUD_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = updateStudentSchema.parse(req.body);
    // send_portal_login_sms is create-only (see POST / below) — destructured
    // here purely to exclude it from the prisma update payload.
    const { selected_optional_subject_ids, send_portal_login_sms: _send_portal_login_sms, ...fields } = body;

    const existing = await prisma.student.findFirst({ where: { id, deleted_at: null } });
    if (!existing) throw notFound("Student not found");

    const classChanged = fields.current_class_id && fields.current_class_id !== existing.current_class_id;

    const updated = await prisma.$transaction(async (tx) => {
      if (classChanged && existing.current_class_id) {
        const activeYear = await tx.academicYear.findFirst({ where: { is_active: true } });
        if (activeYear) {
          await tx.studentAcademicHistory.create({
            data: {
              student_id: id,
              academic_year_id: activeYear.id,
              class_id: existing.current_class_id,
              section_id: existing.current_section_id,
              roll_no: existing.current_roll_no,
              status: "PROMOTED",
            },
          });
        }
      }

      const result = await tx.student.update({ where: { id }, data: fields });

      if (classChanged && fields.current_class_id) {
        const activeYear = await tx.academicYear.findFirst({ where: { is_active: true } });
        await inheritSubjectsForClass(tx, id, fields.current_class_id, activeYear?.id ?? "", selected_optional_subject_ids);
      }

      return result;
    });

    res.json({ success: true, data: updated });
  }),
);

studentsRouter.delete(
  "/:id",
  authorize(STUDENT_CRUD_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const student = await prisma.student.update({
      where: { id },
      data: { deleted_at: new Date(), status: "INACTIVE" },
    });
    if (student.user_id) {
      await prisma.user.update({ where: { id: student.user_id }, data: { is_active: false } });
    }
    await logAudit("STUDENT_DELETE", { userId: req.user!.sub, targetType: "Student", targetId: id, req });
    res.status(204).send();
  }),
);

studentsRouter.post(
  "/:id/promote",
  authorize(STUDENT_PROMOTE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = promoteStudentSchema.parse(req.body);

    const existing = await prisma.student.findFirst({ where: { id, deleted_at: null } });
    if (!existing) throw notFound("Student not found");

    const updated = await prisma.$transaction(async (tx) => {
      await tx.studentAcademicHistory.create({
        data: {
          student_id: id,
          academic_year_id: body.new_academic_year_id,
          class_id: existing.current_class_id ?? body.new_class_id,
          section_id: existing.current_section_id,
          roll_no: existing.current_roll_no,
          status: "PROMOTED",
          notes: body.notes,
          promoted_at: new Date(),
        },
      });

      const result = await tx.student.update({
        where: { id },
        data: { current_class_id: body.new_class_id, current_section_id: body.new_section_id, current_roll_no: body.new_roll_no },
      });

      await inheritSubjectsForClass(tx, id, body.new_class_id, body.new_academic_year_id);
      return result;
    });

    res.json({ success: true, data: updated });
  }),
);

// Alumni directory (Phase 29) — a dedicated transition, not a raw status
// edit via PUT /:id, so a graduation always gets a StudentAcademicHistory
// row too, same discipline as /promote.
studentsRouter.post(
  "/:id/graduate",
  authorize(STUDENT_PROMOTE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = graduateStudentSchema.parse(req.body);

    const existing = await prisma.student.findFirst({ where: { id, deleted_at: null } });
    if (!existing) throw notFound("Student not found");

    const updated = await prisma.$transaction(async (tx) => {
      if (existing.current_class_id) {
        const activeYear = await tx.academicYear.findFirst({ where: { is_active: true } });
        if (activeYear) {
          await tx.studentAcademicHistory.create({
            data: {
              student_id: id,
              academic_year_id: activeYear.id,
              class_id: existing.current_class_id,
              section_id: existing.current_section_id,
              roll_no: existing.current_roll_no,
              status: "GRADUATED",
              notes: body.notes,
              promoted_at: new Date(),
            },
          });
        }
      }
      return tx.student.update({ where: { id }, data: { status: "GRADUATED", graduation_year: body.graduation_year } });
    });

    res.json({ success: true, data: updated });
  }),
);

studentsRouter.post(
  "/bulk-promote",
  authorize(STUDENT_PROMOTE_ROLES),
  asyncHandler(async (req, res) => {
    const body = bulkPromoteSchema.parse(req.body);
    const promoted: string[] = [];
    const skipped: { id: string; reason: string }[] = [];

    const attendanceRules = await prisma.attendanceRules.findUnique({ where: { id: "singleton" } });

    for (const studentId of body.student_ids) {
      const student = await prisma.student.findUnique({ where: { id: studentId } });
      if (!student) {
        skipped.push({ id: studentId, reason: "Student not found" });
        continue;
      }

      const failedExam = await prisma.markEntry.findFirst({
        where: { student_id: studentId, grade_letter: "F" },
      });
      if (failedExam) {
        skipped.push({ id: studentId, reason: "Failed a subject in the latest exam" });
        continue;
      }

      if (attendanceRules) {
        const totalAttendance = await prisma.attendanceRecord.count({ where: { person_id: studentId, person_type: "STUDENT" } });
        const presentCount = await prisma.attendanceRecord.count({
          where: { person_id: studentId, person_type: "STUDENT", status: "PRESENT" },
        });
        const percentage = totalAttendance > 0 ? (presentCount / totalAttendance) * 100 : 100;
        if (percentage < attendanceRules.min_attendance_percentage) {
          skipped.push({ id: studentId, reason: `Attendance below ${attendanceRules.min_attendance_percentage}%` });
          continue;
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.studentAcademicHistory.create({
          data: {
            student_id: studentId,
            academic_year_id: body.new_academic_year_id,
            class_id: body.class_id,
            section_id: body.section_id,
            status: "PROMOTED",
            promoted_at: new Date(),
          },
        });
        await tx.student.update({
          where: { id: studentId },
          data: { current_class_id: body.new_class_id, current_section_id: body.new_section_id },
        });
        await inheritSubjectsForClass(tx, studentId, body.new_class_id, body.new_academic_year_id);
      });
      promoted.push(studentId);
    }

    res.json({ success: true, data: { promoted, skipped } });
  }),
);

studentsRouter.get(
  "/:id/subjects",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const subjects = await prisma.studentSubject.findMany({
      where: { student_id: id },
      include: { subject: true },
    });
    res.json({ success: true, data: subjects });
  }),
);

studentsRouter.post(
  "/:id/subjects/extra",
  authorize(STUDENT_CRUD_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = z.object({ subject_id: z.string().min(1), academic_year_id: z.string().min(1) }).parse(req.body);

    const config = await prisma.institutionConfig.findUnique({ where: { id: "singleton" } });
    if (!config?.extra_course_enrollment) throw badRequest("Extra course enrollment is not enabled for this institution");

    const studentSubject = await prisma.studentSubject.create({
      data: { student_id: id, subject_id: body.subject_id, is_inherited: false, academic_year_id: body.academic_year_id },
    });
    res.status(201).json({ success: true, data: studentSubject });
  }),
);

studentsRouter.delete(
  "/:id/subjects/:subject_id",
  authorize(STUDENT_CRUD_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const subjectId = reqParam(req, "subject_id");
    const studentSubject = await prisma.studentSubject.findFirst({ where: { student_id: id, subject_id: subjectId } });
    if (!studentSubject) throw notFound("Subject assignment not found");
    if (studentSubject.is_inherited) throw badRequest("Cannot remove a compulsory subject");

    await prisma.studentSubject.delete({ where: { id: studentSubject.id } });
    res.status(204).send();
  }),
);

studentsRouter.post(
  "/bulk-import",
  authorize(STUDENT_CRUD_ROLES),
  csvUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("A CSV file is required");
    const records: Record<string, string>[] = parse(req.file.buffer.toString("utf-8"), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const preview = records.map((row, index) => {
      const errors: string[] = [];
      if (!row.name_en) errors.push("name_en is required");
      if (!row.gender || !["MALE", "FEMALE", "OTHER"].includes(row.gender)) errors.push("gender must be MALE/FEMALE/OTHER");
      if (!row.father_phone || !/^01\d{9}$/.test(row.father_phone)) errors.push("father_phone must be 11 digits starting with 01");
      if (!row.current_class_id) errors.push("current_class_id is required");
      return { row: index + 1, data: row, valid: errors.length === 0, errors };
    });

    res.json({
      success: true,
      data: { total: preview.length, valid: preview.filter((p) => p.valid).length, preview },
    });
  }),
);

studentsRouter.post(
  "/bulk-import/confirm",
  authorize(STUDENT_CRUD_ROLES),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        academic_year_id: z.string().min(1),
        rows: z.array(
          z.object({
            name_en: z.string().min(1),
            name_bn: z.string().optional(),
            gender: z.enum(["MALE", "FEMALE", "OTHER"]),
            father_name: z.string().optional(),
            father_phone: z.string().regex(/^01\d{9}$/),
            current_class_id: z.string().min(1),
            current_section_id: z.string().optional(),
          }),
        ),
      })
      .parse(req.body);

    const created: string[] = [];
    const failed: { row: number; reason: string }[] = [];

    // Sequential per-row loop with a bcrypt hash + a queued SMS added per
    // row (for the new guardian login) — fine for a realistic school import
    // (tens to low hundreds of rows), not built to guarantee no timeout on
    // a multi-thousand-row CSV against this synchronous endpoint. Accepted
    // as a known limit rather than building an async bulk-job system here.
    for (const [index, row] of body.rows.entries()) {
      try {
        const student_uid = await generateStudentUID(row.current_class_id);
        const { student, guardianLogin } = await prisma.$transaction(async (tx) => {
          // Same guardian-dedup shape as the manual single-add path: reuse
          // an existing Guardian row by phone, or find-or-link a login and
          // create a new one.
          let guardianId: string | null = null;
          let guardianLoginResult: Awaited<ReturnType<typeof createOrLinkPortalLogin>> | null = null;
          const existingGuardian = await tx.guardian.findFirst({ where: { phone: row.father_phone } });
          if (existingGuardian) {
            guardianId = existingGuardian.id;
          } else {
            guardianLoginResult = await createOrLinkPortalLogin(tx, { role: "GUARDIAN", phone: row.father_phone, name: row.father_name ?? "Guardian" });
            const guardian = await tx.guardian.create({
              data: { user_id: guardianLoginResult.userId, name_en: row.father_name ?? "Guardian", relation: "FATHER", phone: row.father_phone },
            });
            guardianId = guardian.id;
          }

          const s = await tx.student.create({
            data: {
              student_uid,
              name_en: row.name_en,
              name_bn: row.name_bn,
              gender: row.gender,
              guardian_id: guardianId,
              father_name: row.father_name,
              father_phone: row.father_phone,
              current_class_id: row.current_class_id,
              current_section_id: row.current_section_id,
              admission_date: new Date(),
            },
          });
          await inheritSubjectsForClass(tx, s.id, row.current_class_id, body.academic_year_id);
          return { student: s, guardianLogin: guardianLoginResult };
        });

        if (guardianLogin?.tempPassword) {
          await sendNotification({
            trigger: "PORTAL_LOGIN_CREATED",
            recipients: [{ name: row.father_name ?? "Guardian", phone: row.father_phone }],
            template_data: { name: row.father_name ?? "Guardian", phone: row.father_phone, password: guardianLogin.tempPassword, portal_url: env.PORTAL_URL ?? "" },
          });
        }

        created.push(student.student_uid);
      } catch (err) {
        failed.push({ row: index + 1, reason: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    res.json({ success: true, data: { created: created.length, failed } });
  }),
);
