import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { documentUpload, verifyDocumentMagicBytes } from "../../middleware/upload";
import { uploadBuffer, getSignedDownloadUrl } from "../../services/storage.service";
import { reqParam } from "../../lib/req-param";
import { resolveOwnStaffId } from "../../lib/own-staff";
import { TEACHER_APP_ROLES } from "../../lib/roles";
import { createTeachingResourceSchema, updateTeachingResourceSchema } from "@education-erp/validators";
import { badRequest, forbidden, notFound } from "../../lib/errors";

// Teacher-side ownership check for the "smart routing" targeting: a teacher
// may only publish into a class they actually teach — either as the class
// teacher of one of its sections, or via a SubjectTeacherAssignment for that
// class (any section). ADMIN/SUPER_ADMIN bypass, matching every other
// ownership check introduced this round (attendance, marks, leave).
async function assertResourceClassOwnership(userId: string, role: string, classId: string): Promise<string> {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return "ADMIN_OVERRIDE";

  const staffId = await resolveOwnStaffId(userId);
  const ownsSection = await prisma.section.findFirst({ where: { class_id: classId, class_teacher_id: staffId } });
  if (ownsSection) return staffId;

  const assignment = await prisma.subjectTeacherAssignment.findFirst({ where: { staff_id: staffId, subject: { class_id: classId } } });
  if (assignment) return staffId;

  throw forbidden("You are not assigned to this class");
}

export const resourcesRouter = Router();
resourcesRouter.use(authenticate);
resourcesRouter.use(authorize(TEACHER_APP_ROLES));

const MANAGE_ALL_ROLES = ["ADMIN", "SUPER_ADMIN"];

resourcesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z.object({ class_id: z.string().optional() }).parse(req.query);
    const manageAll = MANAGE_ALL_ROLES.includes(req.user!.role);
    const staffId = manageAll ? null : await resolveOwnStaffId(req.user!.sub);

    const resources = await prisma.teachingResource.findMany({
      where: {
        ...(query.class_id && { class_id: query.class_id }),
        ...(!manageAll && { teacher_id: staffId! }),
      },
      include: { class: { select: { name_en: true } }, section: { select: { name: true } }, subject: { select: { name_en: true } } },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: resources });
  }),
);

resourcesRouter.post(
  "/",
  documentUpload.single("file"),
  verifyDocumentMagicBytes,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("A file is required");
    const body = createTeachingResourceSchema.parse(req.body);
    const ownerStaffId = await assertResourceClassOwnership(req.user!.sub, req.user!.role, body.class_id);
    // ADMIN/SUPER_ADMIN commonly have no linked Staff row at all — attribute
    // the resource to "administration" (null) rather than forcing a staff
    // link that may not exist, same nullable shape as RoutineSlot.teacher_id.
    const teacherId = ownerStaffId === "ADMIN_OVERRIDE" ? null : ownerStaffId;

    const { blobKey } = await uploadBuffer("teaching-resources", req.file.originalname, req.file.buffer, req.file.mimetype);
    const resource = await prisma.teachingResource.create({
      data: {
        class_id: body.class_id,
        section_id: body.section_id ?? null,
        subject_id: body.subject_id ?? null,
        teacher_id: teacherId,
        title: body.title,
        description: body.description ?? null,
        resource_type: body.resource_type,
        blob_key: blobKey,
        original_filename: req.file.originalname,
        mime_type: req.file.mimetype,
        publish_at: body.publish_at ?? null,
        expire_at: body.expire_at ?? null,
      },
    });
    res.status(201).json({ success: true, data: resource });
  }),
);

async function loadOwnResourceOr404(req: import("express").Request): Promise<{ id: string; teacher_id: string | null; blob_key: string }> {
  const id = reqParam(req, "id");
  const resource = await prisma.teachingResource.findUnique({ where: { id }, select: { id: true, teacher_id: true, blob_key: true } });
  if (!resource) throw notFound("Resource not found");
  if (!MANAGE_ALL_ROLES.includes(req.user!.role)) {
    const staffId = await resolveOwnStaffId(req.user!.sub);
    if (resource.teacher_id !== staffId) throw notFound("Resource not found");
  }
  return resource;
}

resourcesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadOwnResourceOr404(req);
    const body = updateTeachingResourceSchema.parse(req.body);
    const resource = await prisma.teachingResource.update({
      where: { id: existing.id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.resource_type !== undefined && { resource_type: body.resource_type }),
        ...(body.is_published !== undefined && { is_published: body.is_published }),
        ...(body.publish_at !== undefined && { publish_at: body.publish_at }),
        ...(body.expire_at !== undefined && { expire_at: body.expire_at }),
      },
    });
    res.json({ success: true, data: resource });
  }),
);

resourcesRouter.get(
  "/:id/download",
  asyncHandler(async (req, res) => {
    const existing = await loadOwnResourceOr404(req);
    const url = await getSignedDownloadUrl(existing.blob_key);
    res.json({ success: true, data: { url } });
  }),
);

resourcesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadOwnResourceOr404(req);
    await prisma.teachingResource.delete({ where: { id: existing.id } });
    res.status(204).send();
  }),
);
