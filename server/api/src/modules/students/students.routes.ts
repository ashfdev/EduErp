import { Router } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import type { Prisma } from "@education-erp/db";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { csvUpload, documentUpload, verifyDocumentMagicBytes, imageUpload, verifyImageMagicBytes } from "../../middleware/upload";
import { uploadBuffer, getSignedDownloadUrl } from "../../services/storage.service";
import { reqParam } from "../../lib/req-param";
import { STUDENT_CRUD_ROLES, STUDENT_PROMOTE_ROLES, STAFF_ONLY_ROLES } from "../../lib/roles";
import { createStudentSchema, updateStudentSchema, promoteStudentSchema, bulkPromoteSchema, graduateStudentSchema, deactivateStudentSchema, studentDocumentSchema } from "@education-erp/validators";
import { generateStudentUID } from "../../utils/student-id.generator";
import { inheritSubjectsForClass, assertGroupSelectedIfRequired } from "../../utils/subject-inheritance";
import { checkPromotionEligibility } from "../../utils/promotion-eligibility";
import { invoiceReadmissionFeeIfConfigured } from "../fees/invoice-helpers";
import { computeStudentLibraryFines } from "../library/library-fine.helper";
import { sendNotification } from "../../services/notification.service";
import { createOrLinkPortalLogin } from "../../lib/portal-login";
import { assertSectionCapacity } from "../../lib/section-capacity";
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
  group: { select: { id: true, name_en: true } },
  guardian: { select: { phone: true } },
  // Powers the "No documents on file" warning badge (Plan Thirteen, Phase
  // N) — mirrors the identical `_count.documents` pattern already used for
  // Staff/Faculty (Plan Eight).
  _count: { select: { documents: true } },
} as const;

studentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        search: z.string().optional(),
        class_id: z.string().optional(),
        section_id: z.string().optional(),
        group_id: z.string().optional(),
        status: z.string().optional(),
        gender: z.string().optional(),
        // Student has no direct FK to Program/Department — resolved via its
        // current Class's own program_id / program.department_id relation
        // (university-mode filtering; Section stays a first-class filter
        // for university too, layered alongside these, not replaced).
        program_id: z.string().optional(),
        department_id: z.string().optional(),
        // New "Session" filter (Plan Thirteen, Phase D) — didn't exist on
        // this route before; resolved via the student's current Class's
        // own academic_year_id, same relation-hop pattern already used for
        // program_id/department_id above.
        academic_year_id: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);

    // Merged into one object rather than 3 separate `current_class: {...}`
    // spread entries — object-literal key collisions mean only the LAST
    // `current_class` spread would otherwise survive, silently dropping
    // whichever of program_id/department_id/academic_year_id came first
    // whenever more than one was supplied together (a real pre-existing bug
    // for the program_id+department_id combo, worse now that a 3rd filter
    // is being added — fixed here, not just avoided for the new one).
    const currentClassFilter = {
      ...(query.program_id && { program_id: query.program_id }),
      ...(query.department_id && { program: { department_id: query.department_id } }),
      ...(query.academic_year_id && { academic_year_id: query.academic_year_id }),
    };

    const where = {
      deleted_at: null,
      ...(query.class_id && { current_class_id: query.class_id }),
      ...(query.section_id && { current_section_id: query.section_id }),
      ...(query.group_id && { group_id: query.group_id }),
      ...(query.status && { status: query.status as never }),
      ...(query.gender && { gender: query.gender as never }),
      ...(Object.keys(currentClassFilter).length > 0 && { current_class: currentClassFilter }),
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
        group_id: z.string().optional(),
        status: z.string().optional(),
        gender: z.string().optional(),
        // Matches GET / exactly — the frontend already sends both in the
        // same filterParams object to this route and the list route, so an
        // export was previously silently ignoring a university admin's
        // Department/Program filter (Plan Thirteen, Phase D fix).
        program_id: z.string().optional(),
        department_id: z.string().optional(),
      })
      .parse(req.query);

    // Same collision fix as GET / — merge into one current_class filter
    // object instead of two separate spread entries with the same key.
    const currentClassFilter = {
      ...(query.program_id && { program_id: query.program_id }),
      ...(query.department_id && { program: { department_id: query.department_id } }),
    };

    const where = {
      deleted_at: null,
      ...(query.class_id && { current_class_id: query.class_id }),
      ...(query.section_id && { current_section_id: query.section_id }),
      ...(query.group_id && { group_id: query.group_id }),
      ...(query.status && { status: query.status as never }),
      ...(query.gender && { gender: query.gender as never }),
      ...(Object.keys(currentClassFilter).length > 0 && { current_class: currentClassFilter }),
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

// Feeds the Class-Wide Promotion admin screen (Phase 82) — the real roster
// for a class/section, each student annotated with the same eligibility
// check bulk-promote itself enforces, so the UI can pre-exclude a failed or
// low-attendance student with its reason before anything is submitted, not
// just discover it after a rejected bulk-promote call. Registered before
// GET /:id so "promotion-roster" isn't swallowed as an :id value.
studentsRouter.get(
  "/promotion-roster",
  authorize(STUDENT_PROMOTE_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ class_id: z.string().min(1), section_id: z.string().optional() }).parse(req.query);
    const students = await prisma.student.findMany({
      where: {
        deleted_at: null,
        status: "ACTIVE",
        current_class_id: query.class_id,
        ...(query.section_id && { current_section_id: query.section_id }),
      },
      select: STUDENT_LIST_SELECT,
      orderBy: { current_roll_no: "asc" },
    });

    const roster = await Promise.all(
      students.map(async (s) => ({ ...s, eligibility: await checkPromotionEligibility(prisma, s.id) })),
    );

    res.json({ success: true, data: roster });
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
        group: true,
        academic_history: { include: { academic_year: true, class: true, section: true }, orderBy: { created_at: "desc" } },
        student_subjects: { include: { subject: true } },
        attendance: { orderBy: { date: "desc" }, take: 60 },
        mark_entries: { include: { exam: true, subject: true } },
        invoices: { include: { payments: true, fee_structure: { select: { frequency: true } } }, orderBy: { due_date: "desc" } },
        // Powers the "No documents on file" warning badge (Plan Thirteen,
        // Phase N), mirroring Staff/Faculty's identical pattern (Plan Eight).
        _count: { select: { documents: true } },
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
    // student.attendance is already ordered date desc, so [0] is the most
    // recent campus-presence record (entry/exit, Plan Twelve Phase 5).
    const mostRecentAttendance = student.attendance[0] ?? null;

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
          middle_name: student.middle_name,
          nick_name: student.nick_name,
          date_of_birth: student.date_of_birth,
          gender: student.gender,
          religion: student.religion,
          blood_group: student.blood_group,
          nationality: student.nationality,
          phone: student.phone,
          other_phone: student.other_phone,
          passport_no: student.passport_no,
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
          father_occupation: student.father_occupation,
          father_photo_url: student.father_photo_url,
          mother_name: student.mother_name,
          mother_phone: student.mother_phone,
          mother_occupation: student.mother_occupation,
          mother_photo_url: student.mother_photo_url,
          // Powers the "No documents on file" warning badge (Plan Thirteen,
          // Phase N), mirroring Staff/Faculty's identical pattern (Plan Eight).
          documents_count: student._count.documents,
        },
        academic: {
          current: {
            class: student.current_class,
            section: student.current_section,
            group: student.group,
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
          most_recent: mostRecentAttendance
            ? { date: mostRecentAttendance.date, check_in_at: mostRecentAttendance.check_in_at, check_out_at: mostRecentAttendance.check_out_at }
            : null,
        },
        results: student.mark_entries,
        fees: {
          invoices: student.invoices,
          outstanding_total: outstandingTotal,
          paid_total: paidTotal,
          credit_balance: student.credit_balance,
        },
        library: libraryFines,
        transport: transport ? { route_name: transport.route.name, fare: transport.route.fare, pickup_stop: transport.pickup_stop } : null,
        hostel: hostelAllocation ? { block_name: hostelAllocation.room.block.name, room_no: hostelAllocation.room.room_no, bed_no: hostelAllocation.bed_no } : null,
        discipline: [],
      },
    });
  }),
);

// Pre-creation photo upload (Plan Thirteen, Phase N) — mirrors the
// equivalent staff route exactly: no Student id exists yet, this just
// returns a URL to attach to the create payload's now-mandatory photo_url.
studentsRouter.post(
  "/photo",
  authorize(STUDENT_CRUD_ROLES),
  imageUpload.single("photo"),
  verifyImageMagicBytes,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("A photo file is required");
    const { url } = await uploadBuffer("students", req.file.originalname, req.file.buffer, req.file.mimetype);
    res.json({ success: true, data: { photo_url: url } });
  }),
);

studentsRouter.post(
  "/",
  authorize(STUDENT_CRUD_ROLES),
  asyncHandler(async (req, res) => {
    const body = createStudentSchema.parse(req.body);
    await assertSectionCapacity(body.current_section_id, req.body.override === true);
    await assertGroupSelectedIfRequired(prisma, body.current_class_id, body.group_id);

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
          middle_name: body.middle_name,
          nick_name: body.nick_name,
          date_of_birth: body.date_of_birth,
          gender: body.gender,
          religion: body.religion,
          nationality: body.nationality ?? undefined,
          blood_group: body.blood_group,
          nid_or_birth_reg: body.nid_or_birth_reg,
          passport_no: body.passport_no,
          phone: body.phone,
          other_phone: body.other_phone,
          guardian_id: guardianId,
          father_name: body.father_name,
          father_phone: body.father_phone,
          father_nid: body.father_nid,
          father_occupation: body.father_occupation,
          father_photo_url: body.father_photo_url,
          mother_name: body.mother_name,
          mother_phone: body.mother_phone,
          mother_nid: body.mother_nid,
          mother_occupation: body.mother_occupation,
          mother_photo_url: body.mother_photo_url,
          address_permanent: body.address_permanent,
          address_current: body.address_current,
          district: body.district,
          present_house_name: body.present_house_name,
          present_village: body.present_village,
          present_post_code: body.present_post_code,
          present_district: body.present_district,
          present_division: body.present_division,
          permanent_house_name: body.permanent_house_name,
          permanent_village: body.permanent_village,
          permanent_post_code: body.permanent_post_code,
          permanent_district: body.permanent_district,
          permanent_division: body.permanent_division,
          photo_url: body.photo_url,
          current_class_id: body.current_class_id,
          current_section_id: body.current_section_id,
          group_id: body.group_id,
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

      await inheritSubjectsForClass(tx, created.id, body.current_class_id, body.academic_year_id, body.selected_optional_subject_ids, body.group_id);

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
    const sectionChanged = fields.current_section_id && fields.current_section_id !== existing.current_section_id;
    if (sectionChanged) await assertSectionCapacity(fields.current_section_id, req.body.override === true);
    // Only run the group check when this request actually touches class or
    // group — an unrelated field edit (e.g. phone number) must never fail
    // because of a pre-existing, unrelated group gap on the student's record.
    if (classChanged || fields.group_id !== undefined) {
      await assertGroupSelectedIfRequired(prisma, fields.current_class_id ?? existing.current_class_id!, fields.group_id);
    }

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

      // Explicit cast: TS's union-discrimination between Prisma's
      // StudentUpdateInput/StudentUncheckedUpdateInput starts failing once
      // `fields`'s inferred object type crosses a certain optional-property
      // count (confirmed by bisecting -- this call site typechecked cleanly
      // before Phase C's 5 new optional Student fields were added to the
      // Zod schema, with no other change here). The runtime shape is
      // unchanged; this only satisfies the type checker.
      const result = await tx.student.update({ where: { id }, data: fields as Prisma.StudentUpdateInput });

      if (classChanged && fields.current_class_id) {
        const activeYear = await tx.academicYear.findFirst({ where: { is_active: true } });
        await inheritSubjectsForClass(tx, id, fields.current_class_id, activeYear?.id ?? "", selected_optional_subject_ids, fields.group_id);
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
    // Same failed-subject/attendance safety net bulk-promote already has —
    // a single-student promote must not be a way to bypass it. An explicit
    // override intentionally isn't offered here (unlike section capacity,
    // which is a soft, sometimes-legitimate-to-exceed target) — promoting a
    // student who failed should go through the bulk-promotion screen's
    // deliberate deselect-and-confirm flow, not a silent one-off bypass.
    const eligibility = await checkPromotionEligibility(prisma, id);
    if (!eligibility.eligible) throw badRequest(`Cannot promote: ${eligibility.reason}`);
    if (body.new_section_id && body.new_section_id !== existing.current_section_id) {
      await assertSectionCapacity(body.new_section_id, req.body.override === true);
    }
    await assertGroupSelectedIfRequired(prisma, body.new_class_id, body.new_group_id);

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
        data: { current_class_id: body.new_class_id, current_section_id: body.new_section_id, current_roll_no: body.new_roll_no, group_id: body.new_group_id ?? null },
      });

      await inheritSubjectsForClass(tx, id, body.new_class_id, body.new_academic_year_id, [], body.new_group_id);
      await invoiceReadmissionFeeIfConfigured(tx, id, body.new_class_id, body.new_academic_year_id);
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

// Shared by /transfer and /expel — previously TRANSFERRED/EXPELLED existed
// only as enum values with no route ever able to actually set them (a raw
// PUT /:id silently drops `status`), so a leaving/expelled student's (and
// their guardian's, if this was the guardian's only enrolled child) portal
// login stayed active indefinitely. This is the real fix: a dedicated
// transition (same discipline as /graduate — always writes a
// StudentAcademicHistory row, never a bare status edit) that also actually
// revokes access.
async function deactivateStudentAndRevokeAccess(
  id: string,
  status: "TRANSFERRED" | "EXPELLED",
  body: { reason?: string | null; effective_date?: Date },
) {
  const existing = await prisma.student.findFirst({ where: { id, deleted_at: null }, include: { guardian: true } });
  if (!existing) throw notFound("Student not found");
  if (existing.status === "TRANSFERRED" || existing.status === "EXPELLED" || existing.status === "GRADUATED") {
    throw badRequest(`Student is already ${existing.status.toLowerCase()}`);
  }

  return prisma.$transaction(async (tx) => {
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
            status,
            notes: body.reason,
            promoted_at: body.effective_date ?? new Date(),
          },
        });
      }
    }

    const updated = await tx.student.update({ where: { id }, data: { status } });

    if (existing.user_id) {
      await tx.user.update({ where: { id: existing.user_id }, data: { is_active: false } });
    }

    // A guardian with other still-enrolled children must keep their login —
    // only deactivate it if this was genuinely their last active student.
    if (existing.guardian?.user_id) {
      const otherActiveChildren = await tx.student.count({
        where: { guardian_id: existing.guardian_id, id: { not: id }, deleted_at: null, status: "ACTIVE" },
      });
      if (otherActiveChildren === 0) {
        await tx.user.update({ where: { id: existing.guardian.user_id }, data: { is_active: false } });
      }
    }

    return updated;
  });
}

studentsRouter.post(
  "/:id/transfer",
  authorize(STUDENT_PROMOTE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = deactivateStudentSchema.parse(req.body);
    const updated = await deactivateStudentAndRevokeAccess(id, "TRANSFERRED", body);
    await logAudit("STUDENT_TRANSFER", { userId: req.user!.sub, targetType: "Student", targetId: id, metadata: { reason: body.reason }, req });
    res.json({ success: true, data: updated });
  }),
);

studentsRouter.post(
  "/:id/expel",
  authorize(STUDENT_PROMOTE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = deactivateStudentSchema.parse(req.body);
    const updated = await deactivateStudentAndRevokeAccess(id, "EXPELLED", body);
    await logAudit("STUDENT_EXPEL", { userId: req.user!.sub, targetType: "Student", targetId: id, metadata: { reason: body.reason }, req });
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

    // Checked once for the whole batch (not per-student) — this only tells
    // us whether new_class_id requires a group at all; which specific group
    // each student needs is still resolved per-student below via
    // student_group_ids, since one destination class can receive students
    // headed into different groups.
    const destinationHasGroups = !!(await prisma.group.findFirst({ where: { class_id: body.new_class_id, is_active: true } }));

    for (const studentId of body.student_ids) {
      const student = await prisma.student.findUnique({ where: { id: studentId } });
      if (!student) {
        skipped.push({ id: studentId, reason: "Student not found" });
        continue;
      }

      const eligibility = await checkPromotionEligibility(prisma, studentId);
      if (!eligibility.eligible) {
        skipped.push({ id: studentId, reason: eligibility.reason! });
        continue;
      }

      // Re-checked per student, not once for the whole batch — each commit
      // below changes the target section's count, so a capacity breach can
      // start partway through a large batch, not just at the very first row.
      if (body.new_section_id && body.new_section_id !== student.current_section_id) {
        try {
          await assertSectionCapacity(body.new_section_id, req.body.override === true);
        } catch {
          skipped.push({ id: studentId, reason: "Target section is at or over capacity" });
          continue;
        }
      }

      const groupId = body.student_group_ids?.[studentId];
      if (destinationHasGroups && !groupId) {
        skipped.push({ id: studentId, reason: "Destination class has Groups/Streams defined — no group selected for this student" });
        continue;
      }
      if (groupId) {
        const validGroup = await prisma.group.findFirst({ where: { id: groupId, class_id: body.new_class_id, is_active: true } });
        if (!validGroup) {
          skipped.push({ id: studentId, reason: "Selected group does not belong to the destination class" });
          continue;
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.studentAcademicHistory.create({
          data: {
            student_id: studentId,
            academic_year_id: body.new_academic_year_id,
            // Previously used the request body's source class_id/section_id
            // (the same for every student in the batch) instead of each
            // student's own actual current class/section — harmless for the
            // common case (promoting a whole section at once, where they
            // match), but wrong the moment a batch mixes students from
            // different starting sections, or one has already drifted from
            // what the caller assumed.
            class_id: student.current_class_id ?? body.class_id,
            section_id: student.current_section_id ?? body.section_id,
            roll_no: student.current_roll_no,
            status: "PROMOTED",
            promoted_at: new Date(),
          },
        });
        await tx.student.update({
          where: { id: studentId },
          data: { current_class_id: body.new_class_id, current_section_id: body.new_section_id, group_id: groupId ?? null },
        });
        await inheritSubjectsForClass(tx, studentId, body.new_class_id, body.new_academic_year_id, [], groupId);
        await invoiceReadmissionFeeIfConfigured(tx, studentId, body.new_class_id, body.new_academic_year_id);
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

    // Batched once for the whole file rather than per-row — every group in
    // every class referenced by the CSV, looked up by (class_id, code).
    const classIds = [...new Set(records.map((r) => r.current_class_id).filter((id): id is string => !!id))];
    const groupsByClass = await prisma.group.findMany({ where: { class_id: { in: classIds }, is_active: true } });
    const groupLookup = new Map(groupsByClass.map((g) => [`${g.class_id}:${g.code}`, g]));
    const classesWithGroups = new Set(groupsByClass.map((g) => g.class_id));

    const preview = records.map((row, index) => {
      const errors: string[] = [];
      if (!row.name_en) errors.push("name_en is required");
      if (!row.gender || !["MALE", "FEMALE", "OTHER"].includes(row.gender)) errors.push("gender must be MALE/FEMALE/OTHER");
      if (!row.father_phone || !/^01\d{9}$/.test(row.father_phone)) errors.push("father_phone must be 11 digits starting with 01");
      // phone is optional (a row without it still imports fine — the
      // student just won't get their own portal login, only the guardian's,
      // same as leaving it blank on the manual Add Student form) but must be
      // valid if present.
      if (row.phone && !/^01\d{9}$/.test(row.phone)) errors.push("phone must be 11 digits starting with 01");
      if (!row.current_class_id) errors.push("current_class_id is required");
      else if (classesWithGroups.has(row.current_class_id)) {
        if (!row.group_code) errors.push("this class has Groups/Streams defined — group_code is required");
        else if (!groupLookup.has(`${row.current_class_id}:${row.group_code}`)) errors.push(`group_code "${row.group_code}" not found for this class`);
      }
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
            // Optional, and deliberately conditional below — mirrors
            // admission-enroll's own "only create a student login if a
            // student phone was actually supplied" behavior exactly.
            // Previously there was no column for this at all, meaning a
            // CSV-imported student could NEVER get their own login (only
            // the guardian's), unlike every other student-creation path.
            // A blank CSV cell parses as "" (csv-parse never produces
            // undefined), which would otherwise fail this field's own
            // regex check even though it's meant to be optional —
            // normalize "" to undefined first, live-caught while testing
            // the identical pattern in the new staff bulk-import.
            phone: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^01\d{9}$/).optional()),
            father_name: z.string().optional(),
            father_phone: z.string().regex(/^01\d{9}$/),
            current_class_id: z.string().min(1),
            current_section_id: z.string().optional(),
            group_code: z.string().optional(),
          }),
        ),
      })
      .parse(req.body);

    const created: string[] = [];
    const failed: { row: number; reason: string }[] = [];
    let noOwnLoginCount = 0;

    // Sequential per-row loop with a bcrypt hash + a queued SMS added per
    // row (for the new guardian login) — fine for a realistic school import
    // (tens to low hundreds of rows), not built to guarantee no timeout on
    // a multi-thousand-row CSV against this synchronous endpoint. Accepted
    // as a known limit rather than building an async bulk-job system here.
    for (const [index, row] of body.rows.entries()) {
      try {
        let groupId: string | null = null;
        if (row.group_code) {
          const group = await prisma.group.findFirst({ where: { class_id: row.current_class_id, code: row.group_code, is_active: true } });
          if (!group) throw new Error(`group_code "${row.group_code}" not found for this class`);
          groupId = group.id;
        } else {
          const hasGroups = await prisma.group.findFirst({ where: { class_id: row.current_class_id, is_active: true } });
          if (hasGroups) throw new Error("this class has Groups/Streams defined — group_code is required");
        }

        const student_uid = await generateStudentUID(row.current_class_id);
        const { student, guardianLogin, studentLogin } = await prisma.$transaction(async (tx) => {
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

          // Same conditional-on-phone shape as admission-enroll — a CSV row
          // with no phone column filled in still creates the student (guardian
          // access still works), it just has no own login, same as today; a
          // row that DOES supply a phone now gets one, closing the gap where
          // this path could never create a student-role login at all.
          const studentLoginResult = row.phone ? await createOrLinkPortalLogin(tx, { role: "STUDENT", phone: row.phone, name: row.name_en }) : null;

          const s = await tx.student.create({
            data: {
              user_id: studentLoginResult?.userId,
              student_uid,
              name_en: row.name_en,
              name_bn: row.name_bn,
              gender: row.gender,
              phone: row.phone,
              guardian_id: guardianId,
              father_name: row.father_name,
              father_phone: row.father_phone,
              current_class_id: row.current_class_id,
              current_section_id: row.current_section_id,
              group_id: groupId,
              admission_date: new Date(),
            },
          });
          await inheritSubjectsForClass(tx, s.id, row.current_class_id, body.academic_year_id, [], groupId);
          return { student: s, guardianLogin: guardianLoginResult, studentLogin: studentLoginResult };
        });

        if (guardianLogin?.tempPassword) {
          await sendNotification({
            trigger: "PORTAL_LOGIN_CREATED",
            recipients: [{ name: row.father_name ?? "Guardian", phone: row.father_phone }],
            template_data: { name: row.father_name ?? "Guardian", phone: row.father_phone, password: guardianLogin.tempPassword, portal_url: env.PORTAL_URL ?? "" },
          });
        }
        if (studentLogin?.tempPassword && row.phone) {
          await sendNotification({
            trigger: "PORTAL_LOGIN_CREATED",
            recipients: [{ name: row.name_en, phone: row.phone }],
            template_data: { name: row.name_en, phone: row.phone, password: studentLogin.tempPassword, portal_url: env.PORTAL_URL ?? "" },
          });
        }

        created.push(student.student_uid);
        if (!row.phone) noOwnLoginCount++;
      } catch (err) {
        failed.push({ row: index + 1, reason: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    res.json({
      success: true,
      data: {
        created: created.length,
        failed,
        // Surfaced explicitly rather than left silent — a row with no phone
        // column filled in still imports fine, but that student can only be
        // reached via their guardian's login, not their own, until a phone
        // is added later (e.g. via Edit Student).
        no_own_login_count: noOwnLoginCount,
      },
    });
  }),
);

// ── Documents (Plan Thirteen, Phase C) ────────────────────────────
// Mirrors the Faculty Document Vault's exact shape (hr/staff.routes.ts) --
// private blob_key, signed download URLs only, magic-byte-verified upload.
// Staff-uploaded only (no student/guardian self-service path here), so this
// stays behind the router's existing STAFF_ONLY_ROLES floor gate with no
// extra per-route check needed.

studentsRouter.get(
  "/:id/documents",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const documents = await prisma.studentDocument.findMany({ where: { student_id: id }, orderBy: { uploaded_at: "desc" } });
    res.json({ success: true, data: documents });
  }),
);

studentsRouter.post(
  "/:id/documents",
  documentUpload.single("file"),
  verifyDocumentMagicBytes,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    if (!req.file) throw badRequest("A file is required");
    const body = studentDocumentSchema.parse(req.body);

    const { blobKey } = await uploadBuffer("student-documents", req.file.originalname, req.file.buffer, req.file.mimetype);
    const document = await prisma.studentDocument.create({
      data: {
        student_id: id,
        doc_type: body.doc_type,
        blob_key: blobKey,
        original_filename: req.file.originalname,
        mime_type: req.file.mimetype,
        uploaded_by_id: req.user!.sub,
      },
    });
    res.status(201).json({ success: true, data: document });
  }),
);

// Replaces a document's file content in place (Plan Fourteen, Phase B2) --
// preserves id/doc_type/uploaded_at history rather than losing it to a
// delete-then-recreate round-trip. doc_type may optionally be corrected too.
studentsRouter.put(
  "/:id/documents/:doc_id",
  documentUpload.single("file"),
  verifyDocumentMagicBytes,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.studentDocument.findFirst({ where: { id: reqParam(req, "doc_id"), student_id: id } });
    if (!existing) throw notFound("Document not found");
    if (!req.file) throw badRequest("A file is required");
    const body = studentDocumentSchema.partial().parse(req.body);

    const { blobKey } = await uploadBuffer("student-documents", req.file.originalname, req.file.buffer, req.file.mimetype);
    const document = await prisma.studentDocument.update({
      where: { id: existing.id },
      data: {
        ...(body.doc_type && { doc_type: body.doc_type }),
        blob_key: blobKey,
        original_filename: req.file.originalname,
        mime_type: req.file.mimetype,
      },
    });
    res.json({ success: true, data: document });
  }),
);

studentsRouter.get(
  "/:id/documents/:doc_id/download",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const document = await prisma.studentDocument.findFirst({ where: { id: reqParam(req, "doc_id"), student_id: id } });
    if (!document) throw notFound("Document not found");
    const url = await getSignedDownloadUrl(document.blob_key);
    res.json({ success: true, data: { url } });
  }),
);

studentsRouter.delete(
  "/:id/documents/:doc_id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const document = await prisma.studentDocument.findFirst({ where: { id: reqParam(req, "doc_id"), student_id: id } });
    if (!document) throw notFound("Document not found");
    await prisma.studentDocument.delete({ where: { id: document.id } });
    res.status(204).send();
  }),
);
