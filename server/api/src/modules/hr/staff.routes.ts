import { Router } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { imageUpload, verifyImageMagicBytes, documentUpload, verifyDocumentMagicBytes, csvUpload } from "../../middleware/upload";
import { parse } from "csv-parse/sync";
import { uploadBuffer, getSignedDownloadUrl } from "../../services/storage.service";
import { reqParam } from "../../lib/req-param";
import { HR_MANAGE_ROLES, PAYROLL_MANAGE_ROLES, STAFF_READ_ROLES, TEACHING_ROLES } from "../../lib/roles";
import { createStaffSchema, updateStaffSchema, assignSalaryStructureSchema, bulkAssignSalaryStructureSchema, staffDocumentSchema, staffExperienceSchema, staffReferenceSchema, staffResignSchema, staffRejoinSchema } from "@education-erp/validators";
import { logAudit } from "../../lib/audit-log";
import { generateStaffUid } from "../../utils/staff-id.generator";
import { triggerRevalidation } from "../../services/revalidate.service";
import { createOrLinkPortalLogin } from "../../lib/portal-login";
import { sendNotification } from "../../services/notification.service";
import { notifyRoles } from "../../services/in-app-notification.service";
import { env } from "../../lib/env";
import { resolveOwnStaffId } from "../../lib/own-staff";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors";
import type { UserRole } from "@education-erp/types";
import type { Prisma } from "@education-erp/db";

// Faculty document vault: a staff member manages their own documents;
// HR_MANAGE_ROLES may manage anyone's (e.g. onboarding uploads a new hire's
// certificates before that person even has login access yet). "me" lets a
// self-service caller (the teacher app) avoid needing to already know their
// own Staff.id — returns the resolved, real staff_id to use in the query.
async function resolveDocumentStaffId(req: import("express").Request, rawStaffId: string): Promise<string> {
  const staffId = rawStaffId === "me" ? await resolveOwnStaffId(req.user!.sub) : rawStaffId;
  if (HR_MANAGE_ROLES.includes(req.user!.role as UserRole)) return staffId;
  const ownId = await resolveOwnStaffId(req.user!.sub);
  if (ownId !== staffId) throw forbidden("You can only manage your own documents");
  return staffId;
}

export const hrStaffRouter = Router();
hrStaffRouter.use(authenticate);

// Faculty vs Staff split for the HR admin's two list pages — derived from
// User.role (matches TEACHING_ROLES exactly, the same boundary the "assign
// a teacher" picker in staff/staff.routes.ts uses), not a separate stored
// category field, so a role change (e.g. teacher reassigned to Accountant)
// automatically moves someone between lists with nothing to keep in sync.
const categorySchema = z.enum(["FACULTY", "STAFF"]).optional();
function categoryWhereClause(category?: "FACULTY" | "STAFF") {
  if (category === "FACULTY") return { user: { role: { in: TEACHING_ROLES } } };
  if (category === "STAFF") return { user: { role: { notIn: TEACHING_ROLES } } };
  return {};
}

hrStaffRouter.get(
  "/",
  authorize(STAFF_READ_ROLES),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        search: z.string().optional(),
        department_id: z.string().optional(),
        employment_type: z.string().optional(),
        is_active: z.string().optional(),
        category: categorySchema,
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);

    const where = {
      deleted_at: null,
      ...(query.department_id && { department_id: query.department_id }),
      ...(query.employment_type && { employment_type: query.employment_type as never }),
      ...(query.is_active !== undefined && { is_active: query.is_active === "true" }),
      ...categoryWhereClause(query.category),
      ...(query.search && {
        OR: [
          { name_en: { contains: query.search, mode: "insensitive" as const } },
          { staff_uid: { contains: query.search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.staff.findMany({
        where,
        include: {
          department: { select: { id: true, name_en: true } },
          user: { select: { role: true, is_active: true } },
          _count: { select: { documents: true } },
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { created_at: "desc" },
      }),
      prisma.staff.count({ where }),
    ]);

    res.json({ success: true, data: items, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
  }),
);

// Registered before "/:id" — otherwise Express would match "export" as an id.
hrStaffRouter.get(
  "/export",
  authorize(STAFF_READ_ROLES),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        search: z.string().optional(),
        department_id: z.string().optional(),
        employment_type: z.string().optional(),
        is_active: z.string().optional(),
        category: categorySchema,
      })
      .parse(req.query);

    const where = {
      deleted_at: null,
      ...(query.department_id && { department_id: query.department_id }),
      ...(query.employment_type && { employment_type: query.employment_type as never }),
      ...(query.is_active !== undefined && { is_active: query.is_active === "true" }),
      ...categoryWhereClause(query.category),
      ...(query.search && {
        OR: [
          { name_en: { contains: query.search, mode: "insensitive" as const } },
          { staff_uid: { contains: query.search, mode: "insensitive" as const } },
        ],
      }),
    };

    const staff = await prisma.staff.findMany({
      where,
      include: { department: { select: { name_en: true } }, user: { select: { role: true, phone: true, is_active: true } } },
      orderBy: { created_at: "desc" },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Staff");
    sheet.columns = [
      { header: "Staff ID", key: "staff_uid", width: 16 },
      { header: "Name", key: "name_en", width: 24 },
      { header: "Designation", key: "designation", width: 20 },
      { header: "Department", key: "department", width: 18 },
      { header: "Role", key: "role", width: 16 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Employment Type", key: "employment_type", width: 16 },
      { header: "Active", key: "is_active", width: 10 },
    ];
    for (const s of staff) {
      sheet.addRow({
        staff_uid: s.staff_uid,
        name_en: s.name_en,
        designation: s.designation,
        department: s.department?.name_en ?? "",
        role: s.user?.role ?? "",
        phone: s.user?.phone ?? "",
        employment_type: s.employment_type,
        is_active: s.is_active ? "Yes" : "No",
      });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="Staff.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  }),
);

hrStaffRouter.get(
  "/:id",
  authorize(STAFF_READ_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    // STAFF_READ_ROLES is broad (any teacher can look up a colleague in the
    // directory) but salary data is PAYROLL_MANAGE_ROLES-only — strip it
    // from the response entirely rather than relying on the frontend to
    // hide fields it already received.
    const canViewPayroll = PAYROLL_MANAGE_ROLES.includes(req.user!.role as UserRole);
    const staff = await prisma.staff.findFirst({
      where: { id, deleted_at: null },
      include: {
        department: true,
        program: { select: { id: true, name_en: true } },
        user: { select: { role: true, phone: true, email: true, is_active: true, last_login_at: true } },
        salary_structure: canViewPayroll,
        subject_assignments: { include: { subject: true } },
        leave_requests: { include: { leave_type: true }, orderBy: { created_at: "desc" } },
        payroll_records: canViewPayroll ? { orderBy: [{ year: "desc" }, { month: "desc" }] } : false,
        _count: { select: { documents: true } },
      },
    });
    if (!staff) throw notFound("Staff not found");
    res.json({ success: true, data: staff });
  }),
);

// Pre-creation photo upload (Plan Thirteen, Phase M) — mirrors
// institution.routes.ts's own "POST /logo" shape exactly: no owning entity
// id exists yet, this just returns a URL to attach to the create payload.
hrStaffRouter.post(
  "/photo",
  authorize(HR_MANAGE_ROLES),
  imageUpload.single("photo"),
  verifyImageMagicBytes,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("A photo file is required");
    const { url } = await uploadBuffer("staff", req.file.originalname, req.file.buffer, req.file.mimetype);
    res.json({ success: true, data: { photo_url: url } });
  }),
);

hrStaffRouter.post(
  "/",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = createStaffSchema.parse(req.body);
    if (body.create_login && !body.phone) throw badRequest("phone is required to create a login account");

    if (body.phone) {
      const existingUser = await prisma.user.findUnique({ where: { phone: body.phone } });
      if (existingUser) throw conflict("A user with this phone number already exists");
    }

    let tempPassword: string | null = null;
    const staff = await prisma.$transaction(async (tx) => {
      const staff_uid = await generateStaffUid();
      let userId: string | undefined;

      if (body.create_login && body.phone) {
        // The pre-check above already rejected an existing phone (409) — a
        // staff account must never silently link to an unrelated existing
        // login, unlike the guardian-sibling-sharing-a-phone case elsewhere.
        const login = await createOrLinkPortalLogin(tx, { role: body.role as UserRole, phone: body.phone, name: body.name_en, password_override: body.login_password });
        userId = login.userId;
        tempPassword = login.tempPassword;
      } else {
        // Staff.user_id is a required, unique FK — every Staff row needs a User
        // row even when no interactive login is granted, so create a
        // deactivated shell account in that case.
        const shellPhone = body.phone ?? `00${Date.now().toString().slice(-9)}`;
        const password_hash = await bcrypt.hash(randomBytes(16).toString("hex"), 10);
        const user = await tx.user.create({
          data: { name_en: body.name_en, name_bn: body.name_bn, phone: shellPhone, email: body.email, role: body.role as UserRole, password_hash, is_active: false },
        });
        userId = user.id;
      }

      const created = await tx.staff.create({
        data: {
          user_id: userId,
          staff_uid,
          name_en: body.name_en,
          name_bn: body.name_bn,
          designation: body.designation,
          department_id: body.department_id,
          program_id: body.program_id,
          date_of_birth: body.date_of_birth,
          gender: body.gender,
          religion: body.religion,
          blood_group: body.blood_group,
          nid: body.nid,
          tin: body.tin,
          phone: body.phone,
          email: body.email,
          address: body.address,
          address_house_name: body.address_house_name,
          address_village: body.address_village,
          address_post_code: body.address_post_code,
          address_district: body.address_district,
          address_division: body.address_division,
          photo_url: body.photo_url,
          employment_type: body.employment_type,
          joining_date: body.joining_date ?? new Date(),
          biometric_id: body.biometric_id,
          max_periods_per_day: body.max_periods_per_day,
          max_periods_per_week: body.max_periods_per_week,
          show_on_website: body.show_on_website,
          qualifications: body.qualifications,
          achievements: body.achievements,
          publications: body.publications as Prisma.InputJsonValue | undefined,
          salary_structure_id: body.salary_structure_id,
          created_by_id: req.user!.sub,
        },
      });

      return created;
    });

    if (body.create_login && body.phone && tempPassword) {
      await sendNotification({
        trigger: "PORTAL_LOGIN_CREATED",
        recipients: [{ name: body.name_en, phone: body.phone, email: body.email }],
        template_data: { name: body.name_en, phone: body.phone, password: tempPassword, portal_url: env.ADMIN_URL ?? "" },
      });
    }

    if (!staff.salary_structure_id) {
      await notifyRoles(PAYROLL_MANAGE_ROLES, {
        type: "STAFF_MISSING_SALARY_STRUCTURE",
        title: `${staff.name_en} has no salary structure`,
        body: "Assign one so this staff member is included in the next payroll run.",
        link: `/hr/staff/${staff.id}`,
      });
    }

    if (body.show_on_website) await triggerRevalidation(["/faculty"]);

    res.status(201).json({ success: true, data: { ...staff, temp_password: tempPassword } });
  }),
);

// Bulk staff/faculty import — previously the only way to onboard staff was
// one at a time via POST / above, with no faster legitimate path for
// onboarding 70-100 staff at once (unlike students, which already have a
// bulk CSV path). Mirrors students.routes.ts's preview-then-confirm shape
// exactly: STAFF_ROLE_VALUES excludes STUDENT/GUARDIAN (portal-only roles,
// never valid here), a login is always created (the entire point of a bulk
// staff import is giving real staff real access), and each row runs in its
// own transaction so one bad row doesn't roll back the whole batch.
const STAFF_ROLE_VALUES = [
  "SUPER_ADMIN", "ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "EXAM_CONTROLLER", "HEAD_OF_DEPT",
  "CLASS_TEACHER", "SUBJECT_TEACHER", "ACCOUNTANT", "LIBRARIAN", "TRANSPORT_MANAGER",
  "HOSTEL_MANAGER", "PROCTOR", "REGISTRAR", "IT_ADMIN",
] as const;

hrStaffRouter.post(
  "/bulk-import",
  authorize(HR_MANAGE_ROLES),
  csvUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("A CSV file is required");
    const records: Record<string, string>[] = parse(req.file.buffer.toString("utf-8"), { columns: true, skip_empty_lines: true, trim: true });

    const existingPhones = new Set(
      (
        await prisma.user.findMany({
          where: { phone: { in: records.map((r) => r.phone).filter((p): p is string => !!p) } },
          select: { phone: true },
        })
      ).map((u) => u.phone),
    );

    const preview = records.map((row, index) => {
      const errors: string[] = [];
      if (!row.name_en) errors.push("name_en is required");
      if (!row.designation) errors.push("designation is required");
      if (!row.role || !(STAFF_ROLE_VALUES as readonly string[]).includes(row.role)) errors.push(`role must be one of: ${STAFF_ROLE_VALUES.join(", ")}`);
      if (!row.phone || !/^01\d{9}$/.test(row.phone)) errors.push("phone must be 11 digits starting with 01");
      else if (existingPhones.has(row.phone)) errors.push("a user with this phone number already exists");
      if (row.gender && !["MALE", "FEMALE", "OTHER"].includes(row.gender)) errors.push("gender must be MALE/FEMALE/OTHER");
      return { row: index + 1, data: row, valid: errors.length === 0, errors };
    });

    res.json({ success: true, data: { total: preview.length, valid: preview.filter((p) => p.valid).length, preview } });
  }),
);

// A blank CSV cell parses as "" (csv-parse never produces undefined), which
// would otherwise fail an .email()/.enum() optional field's own format
// check — the exact same class of opaque "Invalid request body" bug this
// session's error-message sweep was fixing, just freshly reintroduced by
// this new endpoint. Normalize "" to undefined before validating.
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

hrStaffRouter.post(
  "/bulk-import/confirm",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        rows: z.array(
          z.object({
            name_en: z.string().min(1),
            name_bn: z.preprocess(emptyToUndefined, z.string().optional()),
            designation: z.string().min(1),
            role: z.enum(STAFF_ROLE_VALUES),
            department_id: z.preprocess(emptyToUndefined, z.string().optional()),
            phone: z.string().regex(/^01\d{9}$/),
            email: z.preprocess(emptyToUndefined, z.string().email().optional()),
            gender: z.preprocess(emptyToUndefined, z.enum(["MALE", "FEMALE", "OTHER"]).optional()),
            employment_type: z.preprocess(emptyToUndefined, z.enum(["PERMANENT", "CONTRACT", "PART_TIME"]).optional()),
            // Name-based, not a raw id — a non-technical CSV author would
            // never have a salary-structure cuid to paste. Resolved
            // case-insensitively below, falling back to whichever structure
            // has is_default: true when blank or unmatched.
            salary_structure_name: z.preprocess(emptyToUndefined, z.string().optional()),
          }),
        ),
      })
      .parse(req.body);

    const salaryStructures = await prisma.salaryStructure.findMany({ select: { id: true, name: true, is_default: true } });
    const salaryStructureByName = new Map(salaryStructures.map((s) => [s.name.trim().toLowerCase(), s.id]));
    const defaultSalaryStructureId = salaryStructures.find((s) => s.is_default)?.id;

    const created: string[] = [];
    const failed: { row: number; reason: string }[] = [];
    const notes: { row: number; note: string }[] = [];
    let missingSalaryStructureCount = 0;

    // Sequential per-row loop — same known-limit reasoning already accepted
    // for the student bulk-import path (fine for a realistic school import,
    // tens to low hundreds of rows, not built to guarantee no timeout on a
    // multi-thousand-row CSV against this synchronous endpoint).
    for (const [index, row] of body.rows.entries()) {
      try {
        const existingUser = await prisma.user.findUnique({ where: { phone: row.phone } });
        if (existingUser) throw new Error("a user with this phone number already exists");

        let salaryStructureId = defaultSalaryStructureId;
        if (row.salary_structure_name) {
          const matched = salaryStructureByName.get(row.salary_structure_name.trim().toLowerCase());
          if (matched) {
            salaryStructureId = matched;
          } else {
            notes.push({
              row: index + 1,
              note: `salary structure "${row.salary_structure_name}" not found — ${defaultSalaryStructureId ? "assigned the default structure instead" : "no default structure configured, left unassigned"}`,
            });
          }
        } else if (defaultSalaryStructureId) {
          notes.push({ row: index + 1, note: "no salary_structure_name given — assigned the default structure" });
        }
        if (!salaryStructureId) missingSalaryStructureCount += 1;

        let tempPassword: string | null = null;
        const staff = await prisma.$transaction(async (tx) => {
          const staff_uid = await generateStaffUid();
          const login = await createOrLinkPortalLogin(tx, { role: row.role as UserRole, phone: row.phone, name: row.name_en });
          tempPassword = login.tempPassword;

          return tx.staff.create({
            data: {
              user_id: login.userId,
              staff_uid,
              name_en: row.name_en,
              name_bn: row.name_bn,
              designation: row.designation,
              department_id: row.department_id,
              phone: row.phone,
              email: row.email,
              gender: row.gender,
              employment_type: row.employment_type ?? "PERMANENT",
              joining_date: new Date(),
              salary_structure_id: salaryStructureId,
              created_by_id: req.user!.sub,
            },
          });
        });

        if (tempPassword) {
          await sendNotification({
            trigger: "PORTAL_LOGIN_CREATED",
            recipients: [{ name: row.name_en, phone: row.phone, email: row.email }],
            template_data: { name: row.name_en, phone: row.phone, password: tempPassword, portal_url: env.ADMIN_URL ?? "" },
          });
        }

        created.push(staff.staff_uid);
      } catch (err) {
        failed.push({ row: index + 1, reason: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    // Batched into one summary notification, not one per row — a large CSV
    // shouldn't spam Accountant/Admin with individual alerts (see D4).
    if (missingSalaryStructureCount > 0) {
      await notifyRoles(PAYROLL_MANAGE_ROLES, {
        type: "STAFF_MISSING_SALARY_STRUCTURE",
        title: `${missingSalaryStructureCount} newly-imported staff have no salary structure`,
        body: "Assign one so they're included in the next payroll run.",
        link: "/hr/staff",
      });
    }

    res.json({ success: true, data: { created: created.length, failed, notes } });
  }),
);

hrStaffRouter.put(
  "/:id",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = updateStaffSchema.parse(req.body);
    const existing = await prisma.staff.findFirst({ where: { id, deleted_at: null } });
    if (!existing) throw notFound("Staff not found");

    const updated = await prisma.staff.update({ where: { id }, data: body as Prisma.StaffUpdateInput });
    if (body.show_on_website !== undefined) await triggerRevalidation(["/faculty"]);
    res.json({ success: true, data: updated });
  }),
);

hrStaffRouter.delete(
  "/:id",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const staff = await prisma.staff.update({ where: { id }, data: { deleted_at: new Date(), is_active: false } });
    await prisma.user.update({ where: { id: staff.user_id }, data: { is_active: false } });
    res.status(204).send();
  }),
);

// Resign/rejoin (Plan Fourteen, Phase I) — deliberately alongside is_active,
// not a replacement for it: is_active stays the real login/active gate,
// these two new fields are the HR record-keeping layer on top. Unlike the
// hard-delete route above (which soft-deletes via deleted_at and disables
// login permanently), resign preserves the staff record in full working
// order — a resigned staff member can rejoin at any time via the paired
// route below.
hrStaffRouter.post(
  "/:id/resign",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = staffResignSchema.parse(req.body);
    const staff = await prisma.staff.findUnique({ where: { id } });
    if (!staff) throw notFound("Staff member not found");

    const updated = await prisma.staff.update({
      where: { id },
      data: { is_active: false, resignation_date: body.resignation_date, resignation_reason: body.resignation_reason },
    });
    await prisma.user.update({ where: { id: staff.user_id }, data: { is_active: false } });

    await logAudit("STAFF_RESIGN", {
      userId: req.user!.sub,
      targetType: "Staff",
      targetId: id,
      metadata: { resignation_date: body.resignation_date, resignation_reason: body.resignation_reason },
      req,
    });

    res.json({ success: true, data: updated });
  }),
);

hrStaffRouter.post(
  "/:id/rejoin",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = staffRejoinSchema.parse(req.body);
    const staff = await prisma.staff.findUnique({ where: { id } });
    if (!staff) throw notFound("Staff member not found");

    // The prior resignation cycle isn't retained beyond this point (a full
    // history log is a natural follow-on if repeat cycles ever need
    // tracking, not built here — see the schema comment on these fields).
    const updated = await prisma.staff.update({
      where: { id },
      data: { is_active: true, rejoin_date: body.rejoin_date, resignation_date: null, resignation_reason: null },
    });
    await prisma.user.update({ where: { id: staff.user_id }, data: { is_active: true } });

    await logAudit("STAFF_REJOIN", { userId: req.user!.sub, targetType: "Staff", targetId: id, metadata: { rejoin_date: body.rejoin_date }, req });

    res.json({ success: true, data: updated });
  }),
);

hrStaffRouter.post(
  "/:id/photo",
  authorize(HR_MANAGE_ROLES),
  imageUpload.single("photo"),
  verifyImageMagicBytes,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    if (!req.file) throw badRequest("A photo file is required");
    const { url } = await uploadBuffer("staff", req.file.originalname, req.file.buffer, req.file.mimetype);
    const staff = await prisma.staff.update({ where: { id }, data: { photo_url: url } });
    res.json({ success: true, data: staff });
  }),
);

hrStaffRouter.post(
  "/:id/signature",
  authorize(HR_MANAGE_ROLES),
  imageUpload.single("signature"),
  verifyImageMagicBytes,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    if (!req.file) throw badRequest("A signature file is required");
    const { url } = await uploadBuffer("staff", req.file.originalname, req.file.buffer, req.file.mimetype);
    const staff = await prisma.staff.update({ where: { id }, data: { signature_url: url } });
    res.json({ success: true, data: staff });
  }),
);

hrStaffRouter.put(
  "/:id/salary-structure",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = assignSalaryStructureSchema.parse(req.body);
    const staff = await prisma.staff.findFirst({ where: { id, deleted_at: null } });
    if (!staff) throw notFound("Staff not found");

    const updated = await prisma.staff.update({ where: { id }, data: { salary_structure_id: body.salary_structure_id } });
    res.json({ success: true, data: updated });
  }),
);

// Bulk equivalent of the single-staff route above — added because
// one-at-a-time assignment was the actual reason payroll only ever showed
// a single staff member's salary option (POST /calculate only picks up
// staff with a salary_structure_id already set, and nothing seeded one at
// creation time), not a bug in the payroll query itself.
hrStaffRouter.put(
  "/salary-structure/bulk",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = bulkAssignSalaryStructureSchema.parse(req.body);
    const result = await prisma.staff.updateMany({
      where: { id: { in: body.staff_ids }, deleted_at: null },
      data: { salary_structure_id: body.salary_structure_id },
    });
    res.json({ success: true, data: { updated: result.count } });
  }),
);

// ── Faculty Document Vault ────────────────────────────────────────

hrStaffRouter.get(
  "/:id/documents",
  asyncHandler(async (req, res) => {
    const id = await resolveDocumentStaffId(req, reqParam(req, "id"));
    const documents = await prisma.staffDocument.findMany({ where: { staff_id: id }, orderBy: { uploaded_at: "desc" } });
    res.json({ success: true, data: documents });
  }),
);

hrStaffRouter.post(
  "/:id/documents",
  documentUpload.single("file"),
  verifyDocumentMagicBytes,
  asyncHandler(async (req, res) => {
    const id = await resolveDocumentStaffId(req, reqParam(req, "id"));
    if (!req.file) throw badRequest("A file is required");
    const body = staffDocumentSchema.parse(req.body);

    const { blobKey } = await uploadBuffer("staff-documents", req.file.originalname, req.file.buffer, req.file.mimetype);
    const document = await prisma.staffDocument.create({
      data: {
        staff_id: id,
        doc_type: body.doc_type,
        title: body.title,
        blob_key: blobKey,
        original_filename: req.file.originalname,
        mime_type: req.file.mimetype,
      },
    });
    res.status(201).json({ success: true, data: document });
  }),
);

// Replaces a document's file content in place (Plan Fourteen, Phase B2) --
// preserves id/doc_type/title/uploaded_at history rather than losing it to a
// delete-then-recreate round-trip.
hrStaffRouter.put(
  "/:id/documents/:doc_id",
  documentUpload.single("file"),
  verifyDocumentMagicBytes,
  asyncHandler(async (req, res) => {
    const id = await resolveDocumentStaffId(req, reqParam(req, "id"));
    const existing = await prisma.staffDocument.findFirst({ where: { id: reqParam(req, "doc_id"), staff_id: id } });
    if (!existing) throw notFound("Document not found");
    if (!req.file) throw badRequest("A file is required");
    const body = staffDocumentSchema.partial().parse(req.body);

    const { blobKey } = await uploadBuffer("staff-documents", req.file.originalname, req.file.buffer, req.file.mimetype);
    const document = await prisma.staffDocument.update({
      where: { id: existing.id },
      data: {
        ...(body.doc_type && { doc_type: body.doc_type }),
        ...(body.title && { title: body.title }),
        blob_key: blobKey,
        original_filename: req.file.originalname,
        mime_type: req.file.mimetype,
      },
    });
    res.json({ success: true, data: document });
  }),
);

hrStaffRouter.get(
  "/:id/documents/:doc_id/download",
  asyncHandler(async (req, res) => {
    const id = await resolveDocumentStaffId(req, reqParam(req, "id"));
    const document = await prisma.staffDocument.findFirst({ where: { id: reqParam(req, "doc_id"), staff_id: id } });
    if (!document) throw notFound("Document not found");
    const url = await getSignedDownloadUrl(document.blob_key);
    res.json({ success: true, data: { url } });
  }),
);

hrStaffRouter.delete(
  "/:id/documents/:doc_id",
  asyncHandler(async (req, res) => {
    const id = await resolveDocumentStaffId(req, reqParam(req, "id"));
    const document = await prisma.staffDocument.findFirst({ where: { id: reqParam(req, "doc_id"), staff_id: id } });
    if (!document) throw notFound("Document not found");
    await prisma.staffDocument.delete({ where: { id: document.id } });
    res.status(204).send();
  }),
);

// ── Staff Experience & Reference (Plan Fourteen, Phase B4) ───────────────
// HR-managed only (unlike Documents above, no self-service path) --
// repeatable prior-employment/referee rows entered during onboarding.

hrStaffRouter.get(
  "/:id/experience",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const rows = await prisma.staffExperience.findMany({ where: { staff_id: reqParam(req, "id") }, orderBy: { start_date: "desc" } });
    res.json({ success: true, data: rows });
  }),
);

hrStaffRouter.post(
  "/:id/experience",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = staffExperienceSchema.parse(req.body);
    const row = await prisma.staffExperience.create({ data: { staff_id: reqParam(req, "id"), ...body } });
    res.status(201).json({ success: true, data: row });
  }),
);

hrStaffRouter.put(
  "/:id/experience/:row_id",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const existing = await prisma.staffExperience.findFirst({ where: { id: reqParam(req, "row_id"), staff_id: reqParam(req, "id") } });
    if (!existing) throw notFound("Experience entry not found");
    const body = staffExperienceSchema.partial().parse(req.body);
    const row = await prisma.staffExperience.update({ where: { id: existing.id }, data: body });
    res.json({ success: true, data: row });
  }),
);

hrStaffRouter.delete(
  "/:id/experience/:row_id",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const existing = await prisma.staffExperience.findFirst({ where: { id: reqParam(req, "row_id"), staff_id: reqParam(req, "id") } });
    if (!existing) throw notFound("Experience entry not found");
    await prisma.staffExperience.delete({ where: { id: existing.id } });
    res.status(204).send();
  }),
);

hrStaffRouter.get(
  "/:id/reference",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const rows = await prisma.staffReference.findMany({ where: { staff_id: reqParam(req, "id") }, orderBy: { created_at: "desc" } });
    res.json({ success: true, data: rows });
  }),
);

hrStaffRouter.post(
  "/:id/reference",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = staffReferenceSchema.parse(req.body);
    const row = await prisma.staffReference.create({ data: { staff_id: reqParam(req, "id"), ...body } });
    res.status(201).json({ success: true, data: row });
  }),
);

hrStaffRouter.put(
  "/:id/reference/:row_id",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const existing = await prisma.staffReference.findFirst({ where: { id: reqParam(req, "row_id"), staff_id: reqParam(req, "id") } });
    if (!existing) throw notFound("Reference entry not found");
    const body = staffReferenceSchema.partial().parse(req.body);
    const row = await prisma.staffReference.update({ where: { id: existing.id }, data: body });
    res.json({ success: true, data: row });
  }),
);

hrStaffRouter.delete(
  "/:id/reference/:row_id",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const existing = await prisma.staffReference.findFirst({ where: { id: reqParam(req, "row_id"), staff_id: reqParam(req, "id") } });
    if (!existing) throw notFound("Reference entry not found");
    await prisma.staffReference.delete({ where: { id: existing.id } });
    res.status(204).send();
  }),
);

// "Substitutions Covered" (Plan Fourteen, Phase C4) — read-only record of
// both directions: periods this staff member was absent for (covered by
// someone else) and periods they covered for someone else. Same
// STAFF_READ_ROLES gate as the main profile GET, since this is display-only
// historical data, not something requiring HR_MANAGE_ROLES to view.
hrStaffRouter.get(
  "/:id/substitutions",
  authorize(STAFF_READ_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const [asOriginal, asSubstitute] = await Promise.all([
      prisma.routineSubstitution.findMany({
        where: { original_teacher_id: id },
        include: {
          substitute_teacher: { select: { name_en: true } },
          routine_slot: { include: { class: { select: { name_en: true } }, section: { select: { name: true } }, subject: { select: { name_en: true } } } },
        },
        orderBy: { date: "desc" },
      }),
      prisma.routineSubstitution.findMany({
        where: { substitute_teacher_id: id },
        include: {
          original_teacher: { select: { name_en: true } },
          routine_slot: { include: { class: { select: { name_en: true } }, section: { select: { name: true } }, subject: { select: { name_en: true } } } },
        },
        orderBy: { date: "desc" },
      }),
    ]);
    res.json({ success: true, data: { as_original: asOriginal, as_substitute: asSubstitute } });
  }),
);
