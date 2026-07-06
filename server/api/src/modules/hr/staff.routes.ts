import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { imageUpload, verifyImageMagicBytes, documentUpload, verifyDocumentMagicBytes } from "../../middleware/upload";
import { uploadBuffer, getSignedDownloadUrl } from "../../services/storage.service";
import { reqParam } from "../../lib/req-param";
import { HR_MANAGE_ROLES, PAYROLL_MANAGE_ROLES } from "../../lib/roles";
import { createStaffSchema, updateStaffSchema, assignSalaryStructureSchema, staffDocumentSchema } from "@education-erp/validators";
import { generateStaffUid } from "../../utils/staff-id.generator";
import { sendSms } from "../../services/sms.service";
import { triggerRevalidation } from "../../services/revalidate.service";
import { resolveOwnStaffId } from "../../lib/own-staff";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors";
import type { UserRole } from "@education-erp/types";

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

hrStaffRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        search: z.string().optional(),
        department_id: z.string().optional(),
        employment_type: z.string().optional(),
        is_active: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);

    const where = {
      deleted_at: null,
      ...(query.department_id && { department_id: query.department_id }),
      ...(query.employment_type && { employment_type: query.employment_type as never }),
      ...(query.is_active !== undefined && { is_active: query.is_active === "true" }),
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
        include: { department: { select: { id: true, name_en: true } }, user: { select: { role: true, is_active: true } } },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { created_at: "desc" },
      }),
      prisma.staff.count({ where }),
    ]);

    res.json({ success: true, data: items, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
  }),
);

hrStaffRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const staff = await prisma.staff.findFirst({
      where: { id, deleted_at: null },
      include: {
        department: true,
        user: { select: { role: true, phone: true, email: true, is_active: true, last_login_at: true } },
        salary_structure: true,
        subject_assignments: { include: { subject: true } },
        leave_requests: { include: { leave_type: true }, orderBy: { created_at: "desc" } },
        payroll_records: { orderBy: [{ year: "desc" }, { month: "desc" }] },
      },
    });
    if (!staff) throw notFound("Staff not found");
    res.json({ success: true, data: staff });
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

    const staff = await prisma.$transaction(async (tx) => {
      const staff_uid = await generateStaffUid();
      let userId: string | undefined;
      let tempPassword: string | undefined;

      if (body.create_login && body.phone) {
        tempPassword = `Stf${randomBytes(4).toString("hex")}!1`;
        const password_hash = await bcrypt.hash(tempPassword, 10);
        const user = await tx.user.create({
          data: { name_en: body.name_en, name_bn: body.name_bn, phone: body.phone, email: body.email, role: body.role as UserRole, password_hash },
        });
        userId = user.id;
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
          date_of_birth: body.date_of_birth,
          gender: body.gender,
          religion: body.religion,
          blood_group: body.blood_group,
          nid: body.nid,
          tin: body.tin,
          phone: body.phone,
          email: body.email,
          address: body.address,
          employment_type: body.employment_type,
          joining_date: body.joining_date ?? new Date(),
          biometric_id: body.biometric_id,
          show_on_website: body.show_on_website,
          created_by_id: req.user!.sub,
        },
      });

      if (body.create_login && body.phone && tempPassword) {
        await sendSms(body.phone, `Your staff account has been created. Temporary password: ${tempPassword}`);
      }

      return created;
    });

    if (body.show_on_website) await triggerRevalidation(["/faculty"]);

    res.status(201).json({ success: true, data: staff });
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

    const updated = await prisma.staff.update({ where: { id }, data: body });
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
