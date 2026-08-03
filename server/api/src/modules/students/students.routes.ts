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
import { createStudentSchema, updateStudentSchema, promoteStudentSchema, bulkPromoteSchema, graduateStudentSchema, deactivateStudentSchema, studentDocumentSchema, createStudentLoginSchema } from "@education-erp/validators";
import { generateStudentUID } from "../../utils/student-id.generator";
import { inheritSubjectsForClass, assertGroupSelectedIfRequired, setFourthSubject } from "../../utils/subject-inheritance";
import { checkPromotionEligibility } from "../../utils/promotion-eligibility";
import { invoiceReadmissionFeeIfConfigured, formatFeePeriod, createMonthlyInvoiceIfMissing, applyWaiversToInvoice } from "../fees/invoice-helpers";
import { feeStructureAppliesToStudent } from "../fees/fee-structure-scope";
import { generateInvoiceNo } from "../fees/fee-number.generator";
import { computeStudentLibraryFines } from "../library/library-fine.helper";
import { sendNotification } from "../../services/notification.service";
import { createOrLinkPortalLogin } from "../../lib/portal-login";
import { assertSectionCapacity } from "../../lib/section-capacity";
import { assertNoOutstandingDues } from "../../lib/outstanding-dues";
import { env } from "../../lib/env";
import { logAudit } from "../../lib/audit-log";
import { badRequest, notFound, conflict } from "../../lib/errors";

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

// Historical-session lookup (Plan Fifteen, Phase B): when the caller selects
// a past Academic Year (not the currently active one), resolve via
// StudentAcademicHistory instead of current_class_id — otherwise a student
// who's since been promoted is invisible under their old class/section, even
// though a full history record for that exact year still exists. Response
// rows are shaped to match STUDENT_LIST_SELECT as closely as possible (same
// field names) with `current_class`/`current_section` substituted for the
// HISTORICAL placement and two new fields (`is_historical`,
// `historical_year_label`) so the frontend can clearly label what it's
// showing, never confusing it with the student's actual current placement.
// Group isn't resolved here — Groups aren't tracked per-year historically.
async function resolveHistoricalStudents(
  query: { search?: string; class_id?: string; section_id?: string; status?: string; gender?: string; page: number; limit: number },
  year: { id: string; label: string },
) {
  const studentFilter = {
    ...(query.status && { status: query.status as never }),
    ...(query.gender && { gender: query.gender as never }),
    ...(query.search && {
      OR: [
        { name_en: { contains: query.search, mode: "insensitive" as const } },
        { student_uid: { contains: query.search, mode: "insensitive" as const } },
      ],
    }),
  };
  const where = {
    academic_year_id: year.id,
    ...(query.class_id && { class_id: query.class_id }),
    ...(query.section_id && { section_id: query.section_id }),
    ...(Object.keys(studentFilter).length > 0 && { student: studentFilter }),
  };

  const [histories, total] = await Promise.all([
    prisma.studentAcademicHistory.findMany({
      where,
      include: {
        student: {
          select: {
            id: true, student_uid: true, name_en: true, name_bn: true, photo_url: true,
            status: true, graduation_year: true, father_phone: true,
            guardian: { select: { phone: true } },
            _count: { select: { documents: true } },
          },
        },
        class: { select: { id: true, name_en: true } },
        section: { select: { id: true, name: true } },
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { created_at: "desc" },
    }),
    prisma.studentAcademicHistory.count({ where }),
  ]);

  return {
    data: histories.map((h) => ({
      id: h.student.id,
      student_uid: h.student.student_uid,
      name_en: h.student.name_en,
      name_bn: h.student.name_bn,
      photo_url: h.student.photo_url,
      current_roll_no: h.roll_no,
      status: h.student.status,
      graduation_year: h.student.graduation_year,
      father_phone: h.student.father_phone,
      current_class: h.class,
      current_section: h.section,
      group: null,
      guardian: h.student.guardian,
      _count: h.student._count,
      is_historical: true,
      historical_year_label: year.label,
    })),
    meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
  };
}

studentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        search: z.string().optional(),
        class_id: z.string().optional(),
        // Comma-separated "any of these classes" — for pickers that already
        // know a whole set of valid classes (e.g. a multi-class exam's own
        // configured classes) and want to pre-scope the roster to exactly
        // that set without the caller having to pick one class at a time.
        // Ignored when the singular class_id is also present.
        class_ids: z.string().optional(),
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

    if (query.academic_year_id) {
      const year = await prisma.academicYear.findUnique({ where: { id: query.academic_year_id } });
      if (year && !year.is_active) {
        const result = await resolveHistoricalStudents(query, year);
        res.json({ success: true, data: result.data, meta: result.meta });
        return;
      }
    }

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

    const classIdsList = query.class_ids
      ? query.class_ids.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    const baseWhere = {
      deleted_at: null,
      ...(query.class_id
        ? { current_class_id: query.class_id }
        : classIdsList?.length && { current_class_id: { in: classIdsList } }),
      ...(query.section_id && { current_section_id: query.section_id }),
      ...(query.group_id && { group_id: query.group_id }),
      ...(query.status && { status: query.status as never }),
      ...(query.gender && { gender: query.gender as never }),
      ...(Object.keys(currentClassFilter).length > 0 && { current_class: currentClassFilter }),
    };

    if (query.search) {
      // Prisma's query builder has no "ORDER BY relevance" for a plain
      // `contains` filter -- a search for "sabb" returning "Md. Sabbir"
      // and "Rakib Sabbir Ahmed" in creation-date order (the previous
      // behavior) reads as broken to anyone expecting name-first matches
      // up top. Two-tier, still fully paginated, no raw SQL: fetch
      // prefix matches first, then contains-but-not-prefix matches to
      // fill the rest of the requested page.
      const search = query.search;
      const prefixOr = [
        { name_en: { startsWith: search, mode: "insensitive" as const } },
        { student_uid: { startsWith: search, mode: "insensitive" as const } },
        { current_roll_no: { startsWith: search, mode: "insensitive" as const } },
        { registration_no: { startsWith: search, mode: "insensitive" as const } },
      ];
      const containsOr = [
        { name_en: { contains: search, mode: "insensitive" as const } },
        { student_uid: { contains: search, mode: "insensitive" as const } },
        { current_roll_no: { contains: search, mode: "insensitive" as const } },
        { registration_no: { contains: search, mode: "insensitive" as const } },
      ];
      const prefixWhere = { ...baseWhere, OR: prefixOr };
      // Second tier = matches the broader "contains" net but NOT already
      // captured by the prefix tier, so nothing is ever double-counted
      // across the two fetches.
      const restWhere = { ...baseWhere, AND: [{ OR: containsOr }, { NOT: { OR: prefixOr } }] };

      const [prefixTotal, restTotal] = await Promise.all([
        prisma.student.count({ where: prefixWhere }),
        prisma.student.count({ where: restWhere }),
      ]);
      const total = prefixTotal + restTotal;
      const skip = (query.page - 1) * query.limit;

      let items: Prisma.StudentGetPayload<{ select: typeof STUDENT_LIST_SELECT }>[] = [];
      if (skip < prefixTotal) {
        const fromPrefix = await prisma.student.findMany({
          where: prefixWhere, select: STUDENT_LIST_SELECT,
          skip, take: query.limit, orderBy: { name_en: "asc" },
        });
        items = fromPrefix;
        const remaining = query.limit - fromPrefix.length;
        if (remaining > 0) {
          const fromRest = await prisma.student.findMany({
            where: restWhere, select: STUDENT_LIST_SELECT,
            skip: 0, take: remaining, orderBy: { name_en: "asc" },
          });
          items = [...items, ...fromRest];
        }
      } else {
        items = await prisma.student.findMany({
          where: restWhere, select: STUDENT_LIST_SELECT,
          skip: skip - prefixTotal, take: query.limit, orderBy: { name_en: "asc" },
        });
      }

      res.json({
        success: true,
        data: items,
        meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
      });
      return;
    }

    const [items, total] = await Promise.all([
      prisma.student.findMany({
        where: baseWhere,
        select: STUDENT_LIST_SELECT,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { created_at: "desc" },
      }),
      prisma.student.count({ where: baseWhere }),
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

// Plan Nineteen — roster for the Bulk Create Student Logins page. Same shape
// as promotion-roster above (unpaginated, one class/section at a time,
// registered before "/:id" for the same reason), but selecting the fields
// that page actually needs (the student's OWN phone + whether they already
// have a login) rather than promotion eligibility.
studentsRouter.get(
  "/login-roster",
  authorize(STUDENT_CRUD_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ class_id: z.string().min(1), section_id: z.string().optional() }).parse(req.query);
    const students = await prisma.student.findMany({
      where: {
        deleted_at: null,
        status: "ACTIVE",
        current_class_id: query.class_id,
        ...(query.section_id && { current_section_id: query.section_id }),
      },
      select: { id: true, student_uid: true, name_en: true, current_roll_no: true, phone: true, user_id: true },
      orderBy: { current_roll_no: "asc" },
    });
    res.json({ success: true, data: students });
  }),
);

// Bulk version of /:id/create-login (Plan Nineteen) — same mechanics
// (createOrLinkPortalLogin, per-student SMS, per-student audit entry)
// applied to a whole class/section roster at once. Per-student try/catch,
// never fails the whole batch over one row's issue -- same resilience
// discipline as bulk-promote/CSV bulk-import.
studentsRouter.post(
  "/bulk-create-login",
  authorize(STUDENT_CRUD_ROLES),
  asyncHandler(async (req, res) => {
    const body = z.object({ student_ids: z.array(z.string()).min(1) }).parse(req.body);

    const created: string[] = [];
    const linked: string[] = [];
    const skipped: { id: string; reason: string }[] = [];

    for (const studentId of body.student_ids) {
      try {
        const student = await prisma.student.findUnique({ where: { id: studentId } });
        if (!student) {
          skipped.push({ id: studentId, reason: "Student not found" });
          continue;
        }
        if (student.user_id) {
          skipped.push({ id: studentId, reason: "Already has a portal login" });
          continue;
        }
        if (!student.phone) {
          skipped.push({ id: studentId, reason: "No phone on file" });
          continue;
        }

        const { login } = await prisma.$transaction(async (tx) => {
          const login = await createOrLinkPortalLogin(tx, { role: "STUDENT", phone: student.phone!, name: student.name_en });
          if (!login.conflict) {
            await tx.student.update({ where: { id: studentId }, data: { user_id: login.userId } });
          }
          return { login };
        });

        if (login.conflict) {
          skipped.push({ id: studentId, reason: `Phone already belongs to a ${login.conflict.existingRole} account (${login.conflict.existingName})` });
          continue;
        }

        if (login.tempPassword) {
          await sendNotification({
            trigger: "PORTAL_LOGIN_CREATED",
            recipients: [{ name: student.name_en, phone: student.phone }],
            template_data: { name: student.name_en, phone: student.phone, password: login.tempPassword, portal_url: env.PORTAL_URL ?? "" },
          });
          created.push(studentId);
        } else {
          linked.push(studentId);
        }
        await logAudit("STUDENT_PORTAL_LOGIN_CREATE", {
          userId: req.user!.sub,
          targetType: "Student",
          targetId: studentId,
          metadata: { linked_existing_user: !login.tempPassword, via: "bulk" },
          req,
        });
      } catch (err) {
        skipped.push({ id: studentId, reason: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    res.json({ success: true, data: { created, linked, skipped } });
  }),
);

// Same preview the online-admission enroll dialog uses (GET
// .../enrollment-fees), generalized to take class_id/academic_year_id
// directly instead of resolving them from an AdmissionApplication -- the
// manual Add Student form has no application to read them from, but the
// underlying question ("which class-wise fees should this new student be
// charged") and the fee-catalog lookup are identical either way.
// Registered before "/:id" -- otherwise Express would match
// "enrollment-fees-preview" as an id (same trap already documented above
// for "/export"/"/:id").
//
// Deliberately does NOT exclude ADMISSION/FORM categories the way the
// admission-enroll version does. That exclusion exists there because an
// online applicant already paid AdmissionCycle.app_fee/form_fee at apply
// time -- showing an ADMISSION-category FeeStructure again would double
// charge them. A manually-added (walk-in) student never went through an
// AdmissionCycle at all, so nothing was ever collected -- ADMISSION/FORM
// structures need to be selectable here or they can never be charged to
// this student by any mechanism, which was the actual gap reported.
studentsRouter.get(
  "/enrollment-fees-preview",
  authorize(STUDENT_CRUD_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ class_id: z.string().min(1), academic_year_id: z.string().min(1), group_id: z.string().optional() }).parse(req.query);
    const candidates = await prisma.feeStructure.findMany({
      where: {
        academic_year_id: query.academic_year_id,
        is_active: true,
        frequency: { in: ["ONE_TIME", "MONTHLY"] },
        OR: [{ class_id: query.class_id }, { classes: { some: { class_id: query.class_id } } }],
      },
      include: { fee_sub_category: { select: { name: true } }, classes: { select: { class_id: true, group_id: true } } },
      orderBy: [{ frequency: "asc" }, { name: "asc" }],
    });
    // Group-aware narrowing (see fee-structure-scope.ts) -- a multi-class
    // structure's own rows may scope it to just one Group within this
    // class; the DB query above is a coarse class-level filter, refined
    // here against each row's group_id. Legacy single-class structures
    // (classes.length === 0) have no group concept and always pass.
    const applicable = candidates.filter((s) =>
      s.classes.length === 0 || s.classes.some((c) => c.class_id === query.class_id && (c.group_id === null || c.group_id === query.group_id)),
    );
    res.json({
      success: true,
      data: applicable.map((s) => ({
        fee_structure_id: s.id,
        name: s.name,
        category: s.category,
        sub_category: s.fee_sub_category?.name ?? null,
        amount: s.amount,
        frequency: s.frequency,
      })),
    });
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
        // section_id: null means "this teacher teaches the whole class,
        // every section" (the same nullable-scoping convention used
        // throughout this codebase, e.g. Subject.group_id) -- a bare
        // section_id: student.current_section_id match alone would miss
        // every whole-class assignment, which is the common case, not the
        // exception. A section-specific override (if one happens to exist
        // for this exact subject) wins over the whole-class one.
        const assignment =
          (student.current_section_id &&
            (await prisma.subjectTeacherAssignment.findFirst({
              where: { subject_id: ss.subject_id, section_id: student.current_section_id },
              include: { staff: { select: { name_en: true, designation: true } } },
            }))) ||
          (await prisma.subjectTeacherAssignment.findFirst({
            where: { subject_id: ss.subject_id, section_id: null },
            include: { staff: { select: { name_en: true, designation: true } } },
          }));
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
          // Whether this student already has a portal login — the "Create
          // Portal Login" action only makes sense to show when this is null.
          has_portal_login: !!student.user_id,
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
          invoices: student.invoices.map((inv) => ({ ...inv, period: formatFeePeriod(inv.month, inv.year) })),
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

// Powers the click-to-expand Academic History detail on the student profile
// page -- StudentSubject rows are already scoped per academic_year_id (see
// inheritSubjectsForClass), so this is the correct, year-scoped source for
// "which subjects did this student actually have back then," unlike the
// main GET /:id response's own student_subjects include (which is
// deliberately left untouched here, out of scope for this fix).
studentsRouter.get(
  "/:id/subjects-for-year/:academic_year_id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const academicYearId = reqParam(req, "academic_year_id");
    const rows = await prisma.studentSubject.findMany({
      where: { student_id: id, academic_year_id: academicYearId },
      include: { subject: true },
      orderBy: { subject: { display_order: "asc" } },
    });
    res.json({
      success: true,
      data: rows.map((r) => ({
        subject_id: r.subject_id,
        name_en: r.subject.name_en,
        code: r.subject.code,
        is_compulsory: r.subject.is_compulsory,
        is_inherited: r.is_inherited,
        is_fourth_subject: r.is_fourth_subject,
      })),
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
    if (body.fourth_subject_id && !body.selected_optional_subject_ids?.includes(body.fourth_subject_id)) {
      throw badRequest("The 4th subject must be one of the selected optional subjects");
    }

    const { student, studentLogin, guardianLogin, student_uid, loginWarnings } = await prisma.$transaction(async (tx) => {
      const loginWarnings: string[] = [];
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
          // of erroring or creating a duplicate. A ROLE-INCOMPATIBLE phone
          // match (e.g. an unrelated staff account) is never silently linked
          // — enrollment still proceeds (this student is real regardless of
          // the guardian's login state), but the conflict is surfaced as a
          // warning instead of vanishing with no trace.
          guardianLoginResult = await createOrLinkPortalLogin(tx, { role: "GUARDIAN", phone: body.father_phone, name: body.father_name ?? "Guardian" });
          if (guardianLoginResult.conflict) {
            loginWarnings.push(
              `Guardian phone ${body.father_phone} already belongs to a ${guardianLoginResult.conflict.existingRole} account (${guardianLoginResult.conflict.existingName}) — no portal login was created for this guardian. Use "Create Guardian Login" with a different phone number once this is resolved.`,
            );
          }
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
      if (studentLoginResult?.conflict) {
        loginWarnings.push(
          `Student phone ${body.phone} already belongs to a ${studentLoginResult.conflict.existingRole} account (${studentLoginResult.conflict.existingName}) — no portal login was created for this student. Use "Create Portal Login" with a different phone number once this is resolved.`,
        );
      }

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

      await inheritSubjectsForClass(tx, created.id, body.current_class_id, body.academic_year_id, body.selected_optional_subject_ids, body.group_id, body.fourth_subject_id);

      // Same class-wise fee invoicing as the online-admission enroll route
      // (see GET /enrollment-fees-preview above) -- omitted entirely means
      // exactly zero invoices, same as this route's own behavior before
      // this existed, so nothing changes for an existing caller that
      // doesn't know about the new field yet.
      if (body.selected_fee_structure_ids) {
        const now = new Date();
        for (const structureId of body.selected_fee_structure_ids) {
          const structure = await tx.feeStructure.findUnique({ where: { id: structureId } });
          if (!structure || !structure.is_active) continue;
          if (!(await feeStructureAppliesToStudent(tx, structure, body.current_class_id, body.current_section_id ?? null, created.id, body.group_id ?? null))) continue;
          if (structure.frequency === "MONTHLY") {
            await createMonthlyInvoiceIfMissing(tx, created.id, structure, now.getMonth() + 1, now.getFullYear());
          } else {
            const existingOneTime = await tx.invoice.findFirst({ where: { student_id: created.id, fee_structure_id: structure.id } });
            if (existingOneTime) continue;
            const oneTimeInvoice = await tx.invoice.create({
              data: {
                invoice_no: await generateInvoiceNo(tx),
                student_id: created.id,
                fee_structure_id: structure.id,
                academic_year_id: body.academic_year_id,
                category: structure.category,
                fee_sub_category_id: structure.fee_sub_category_id,
                description: structure.name,
                amount_due: structure.amount,
                due_date: structure.target_due_date ?? now,
              },
            });
            await applyWaiversToInvoice(tx, oneTimeInvoice);
          }
        }
      }

      return { student: created, studentLogin: studentLoginResult, guardianLogin: guardianLoginResult, student_uid, loginWarnings };
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

    res.status(201).json({ success: true, data: student, login_warnings: loginWarnings.length ? loginWarnings : undefined });
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
    // fourth_subject_id is a StudentSubject-only field (like
    // selected_optional_subject_ids), never a real Student column.
    const { selected_optional_subject_ids, fourth_subject_id, send_portal_login_sms: _send_portal_login_sms, ...fields } = body;

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
        await inheritSubjectsForClass(tx, id, fields.current_class_id, activeYear?.id ?? "", selected_optional_subject_ids, fields.group_id, fourth_subject_id);
      } else if (fourth_subject_id !== undefined) {
        // No class change this time — inheritSubjectsForClass never ran, so
        // a changed 4th-subject pick needs its own narrower update.
        const activeYear = await tx.academicYear.findFirst({ where: { is_active: true } });
        if (activeYear) await setFourthSubject(tx, id, activeYear.id, fourth_subject_id);
      }

      return result;
    });

    res.json({ success: true, data: updated });
  }),
);

// Retroactively creates a portal login for a student who was created
// without one — the only other place a STUDENT-role login gets created is
// inside POST / and the CSV bulk-import-confirm path, both create-time
// only. No existing route can do this after the fact; Settings → Users'
// "Create User" always also creates a Staff row alongside the login, so
// reusing it for a student would create a phantom Staff record.
studentsRouter.post(
  "/:id/create-login",
  authorize(STUDENT_CRUD_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = createStudentLoginSchema.parse(req.body);
    const student = await prisma.student.findUnique({ where: { id } });
    if (!student) throw notFound("Student not found");
    if (student.user_id) throw conflict("This student already has a portal login");

    const phone = body.phone ?? student.phone;
    if (!phone) throw badRequest("A phone number is required — provide one or add it to the student's profile first");

    const { login } = await prisma.$transaction(async (tx) => {
      const login = await createOrLinkPortalLogin(tx, { role: "STUDENT", phone, name: student.name_en, password_override: body.login_password });
      if (login.conflict) {
        throw conflict(`This phone number already belongs to a ${login.conflict.existingRole} account (${login.conflict.existingName}) — use a different phone number, or resolve the conflict manually if this is genuinely the same person.`);
      }
      await tx.student.update({ where: { id }, data: { user_id: login.userId, ...(body.phone && { phone: body.phone }) } });
      return { login };
    });

    if (login.tempPassword) {
      await sendNotification({
        trigger: "PORTAL_LOGIN_CREATED",
        recipients: [{ name: student.name_en, phone }],
        template_data: { name: student.name_en, phone, password: login.tempPassword, portal_url: env.PORTAL_URL ?? "" },
      });
    }
    await logAudit("STUDENT_PORTAL_LOGIN_CREATE", { userId: req.user!.sub, targetType: "Student", targetId: id, metadata: { linked_existing_user: !login.tempPassword }, req });

    res.json({ success: true, data: { phone, temp_password: login.tempPassword }, message: login.tempPassword ? "Login created and credentials sent via SMS" : "Linked to an existing account with this phone number" });
  }),
);

// Same shape as /:id/create-login above, for the student's linked Guardian
// instead -- reached from the student profile page specifically because a
// guardian's own name is very often different from (and easy to forget
// relative to) the student's name, making the generic Settings->Users search
// an unreliable way to find/manage a guardian's login. Keyed off the
// student's id (not a guardian id) to match that exact entry point.
studentsRouter.post(
  "/:id/guardian/create-login",
  authorize(STUDENT_CRUD_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = createStudentLoginSchema.parse(req.body);
    const student = await prisma.student.findUnique({ where: { id }, include: { guardian: true } });
    if (!student) throw notFound("Student not found");
    if (!student.guardian) throw badRequest("This student has no guardian on file");
    if (student.guardian.user_id) throw conflict("This guardian already has a portal login");

    const phone = body.phone ?? student.guardian.phone;
    if (!phone) throw badRequest("A phone number is required — provide one or add it to the guardian's profile first");

    const guardianId = student.guardian.id;
    const guardianName = student.guardian.name_en;
    const { login } = await prisma.$transaction(async (tx) => {
      const login = await createOrLinkPortalLogin(tx, { role: "GUARDIAN", phone, name: guardianName, password_override: body.login_password });
      if (login.conflict) {
        throw conflict(`This phone number already belongs to a ${login.conflict.existingRole} account (${login.conflict.existingName}) — use a different phone number, or resolve the conflict manually if this is genuinely the same person.`);
      }
      await tx.guardian.update({ where: { id: guardianId }, data: { user_id: login.userId, ...(body.phone && { phone: body.phone }) } });
      return { login };
    });

    if (login.tempPassword) {
      await sendNotification({
        trigger: "PORTAL_LOGIN_CREATED",
        recipients: [{ name: guardianName, phone }],
        template_data: { name: guardianName, phone, password: login.tempPassword, portal_url: env.PORTAL_URL ?? "" },
      });
    }
    await logAudit("STUDENT_PORTAL_LOGIN_CREATE", { userId: req.user!.sub, targetType: "Guardian", targetId: guardianId, metadata: { linked_existing_user: !login.tempPassword, via_student_id: id }, req });

    res.json({ success: true, data: { phone, temp_password: login.tempPassword }, message: login.tempPassword ? "Login created and credentials sent via SMS" : "Linked to an existing account with this phone number" });
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

      await inheritSubjectsForClass(
        tx,
        id,
        body.new_class_id,
        body.new_academic_year_id,
        body.selected_optional_subject_ids ?? [],
        body.new_group_id,
        body.fourth_subject_id,
      );
      await invoiceReadmissionFeeIfConfigured(tx, id, body.new_class_id, body.new_academic_year_id, body.new_group_id ?? null);
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
    await assertNoOutstandingDues(id, body.override);

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
  body: { reason?: string | null; effective_date?: Date; override?: boolean },
) {
  const existing = await prisma.student.findFirst({ where: { id, deleted_at: null }, include: { guardian: true } });
  if (!existing) throw notFound("Student not found");
  if (existing.status === "TRANSFERRED" || existing.status === "EXPELLED" || existing.status === "GRADUATED") {
    throw badRequest(`Student is already ${existing.status.toLowerCase()}`);
  }
  await assertNoOutstandingDues(id, body.override);

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
        await inheritSubjectsForClass(
          tx,
          studentId,
          body.new_class_id,
          body.new_academic_year_id,
          body.student_optional_subject_ids?.[studentId] ?? [],
          groupId,
          body.student_fourth_subject_ids?.[studentId],
        );
        await invoiceReadmissionFeeIfConfigured(tx, studentId, body.new_class_id, body.new_academic_year_id, groupId ?? null);
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
    const loginConflicts: { row: number; message: string }[] = [];
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

        if (guardianLogin?.conflict) {
          loginConflicts.push({
            row: index + 1,
            message: `Guardian phone ${row.father_phone} already belongs to a ${guardianLogin.conflict.existingRole} account (${guardianLogin.conflict.existingName}) — no guardian login created.`,
          });
        }
        if (studentLogin?.conflict) {
          loginConflicts.push({
            row: index + 1,
            message: `Student phone ${row.phone} already belongs to a ${studentLogin.conflict.existingRole} account (${studentLogin.conflict.existingName}) — no student login created.`,
          });
        }
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
        // A role-incompatible phone match (e.g. a staff account reused as a
        // guardian's phone) never silently links -- the student/guardian row
        // still imports, just with no working login, surfaced here instead
        // of vanishing with no trace.
        login_conflicts: loginConflicts,
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
