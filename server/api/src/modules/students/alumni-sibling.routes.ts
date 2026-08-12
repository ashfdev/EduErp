import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { HR_MANAGE_ROLES } from "../../lib/roles";
import { badRequest, notFound } from "../../lib/errors";

// ─────────────────────────────────────────────────────────────────
// ALUMNI ROUTER  — /alumni
// Mounted at app level (app.ts) at /alumni, not inside /hr, because
// alumni management spans students, not just HR staff.
// ─────────────────────────────────────────────────────────────────
export const alumniRouter = Router();
alumniRouter.use(authenticate);

const createAlumniSchema = z.object({
  student_id: z.string().min(1),
  graduation_year: z.number().int().min(1900).max(2100),
  current_profession: z.string().optional(),
  higher_education: z.string().optional(),
  is_member_of_assoc: z.boolean().optional(),
});

const updateAlumniSchema = z.object({
  graduation_year: z.number().int().min(1900).max(2100).optional(),
  current_profession: z.string().optional(),
  higher_education: z.string().optional(),
  is_member_of_assoc: z.boolean().optional(),
});

// POST /alumni — create or upsert an alumni profile.
// Typically called when a student's status is flipped to GRADUATED.
alumniRouter.post(
  "/",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = createAlumniSchema.parse(req.body);

    const student = await prisma.student.findFirst({ where: { id: body.student_id, deleted_at: null } });
    if (!student) throw notFound("Student not found");
    if (student.status !== "GRADUATED" && student.status !== "INACTIVE") {
      // Allow creating a profile even for inactive students (e.g., transferred),
      // but not for ACTIVE students — graduating is a prerequisite.
      throw badRequest(`Student status is "${student.status}". Change the student's status to GRADUATED before creating an alumni profile.`);
    }

    const profile = await prisma.alumniProfile.upsert({
      where: { student_id: body.student_id },
      create: {
        student_id: body.student_id,
        graduation_year: body.graduation_year,
        current_profession: body.current_profession ?? null,
        higher_education: body.higher_education ?? null,
        is_member_of_assoc: body.is_member_of_assoc ?? false,
      },
      update: {
        graduation_year: body.graduation_year,
        current_profession: body.current_profession ?? null,
        higher_education: body.higher_education ?? null,
        is_member_of_assoc: body.is_member_of_assoc ?? false,
      },
    });

    res.status(201).json({ success: true, data: profile });
  }),
);

// GET /alumni — list the alumni directory.
alumniRouter.get(
  "/",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({
      year: z.coerce.number().int().optional(),
      is_member: z.string().optional(),
    }).parse(req.query);

    const profiles = await prisma.alumniProfile.findMany({
      where: {
        ...(query.year && { graduation_year: query.year }),
        ...(query.is_member !== undefined && { is_member_of_assoc: query.is_member === "true" }),
      },
      include: {
        student: {
          select: {
            id: true, student_uid: true, name_en: true, name_bn: true, photo_url: true,
            current_class: { select: { name_en: true } },
          },
        },
      },
      orderBy: { graduation_year: "desc" },
    });

    res.json({ success: true, data: profiles });
  }),
);

// GET /alumni/:student_id
alumniRouter.get(
  "/:student_id",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const studentId = reqParam(req, "student_id");
    const profile = await prisma.alumniProfile.findUnique({
      where: { student_id: studentId },
      include: { student: { select: { id: true, student_uid: true, name_en: true, name_bn: true, photo_url: true } } },
    });
    if (!profile) throw notFound("Alumni profile not found");
    res.json({ success: true, data: profile });
  }),
);

// PATCH /alumni/:student_id — update alumni details.
alumniRouter.patch(
  "/:student_id",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const studentId = reqParam(req, "student_id");
    const body = updateAlumniSchema.parse(req.body);
    const existing = await prisma.alumniProfile.findUnique({ where: { student_id: studentId } });
    if (!existing) throw notFound("Alumni profile not found");

    const updated = await prisma.alumniProfile.update({
      where: { student_id: studentId },
      data: {
        ...(body.graduation_year !== undefined && { graduation_year: body.graduation_year }),
        ...(body.current_profession !== undefined && { current_profession: body.current_profession }),
        ...(body.higher_education !== undefined && { higher_education: body.higher_education }),
        ...(body.is_member_of_assoc !== undefined && { is_member_of_assoc: body.is_member_of_assoc }),
      },
    });

    res.json({ success: true, data: updated });
  }),
);

// ─────────────────────────────────────────────────────────────────
// SIBLING GROUP ROUTER  — /sibling-groups
// ─────────────────────────────────────────────────────────────────
export const siblingGroupRouter = Router();
siblingGroupRouter.use(authenticate);

const createSiblingGroupSchema = z.object({
  student_ids: z.array(z.string()).min(2, "A sibling group needs at least 2 students"),
  auto_waiver_percentage: z.number().min(0).max(100).optional(),
});

// POST /sibling-groups — create a new sibling group and link students.
siblingGroupRouter.post(
  "/",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = createSiblingGroupSchema.parse(req.body);

    // Validate all students exist and are not already in another group.
    const students = await prisma.student.findMany({
      where: { id: { in: body.student_ids }, deleted_at: null },
      select: { id: true, name_en: true, sibling_group_id: true },
    });

    if (students.length !== body.student_ids.length) {
      throw badRequest("One or more student IDs are invalid or deleted.");
    }

    const alreadyGrouped = students.filter((s) => s.sibling_group_id !== null);
    if (alreadyGrouped.length > 0) {
      throw badRequest(
        `The following students are already in a sibling group: ${alreadyGrouped.map((s) => s.name_en).join(", ")}. ` +
          `Remove them from their existing group first.`,
      );
    }

    const group = await prisma.$transaction(async (tx) => {
      const newGroup = await tx.siblingGroup.create({
        data: { auto_waiver_percentage: body.auto_waiver_percentage ?? 0 },
      });

      await tx.student.updateMany({
        where: { id: { in: body.student_ids } },
        data: { sibling_group_id: newGroup.id },
      });

      return newGroup;
    });

    res.status(201).json({ success: true, data: group });
  }),
);

// GET /sibling-groups
siblingGroupRouter.get(
  "/",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (_req, res) => {
    const groups = await prisma.siblingGroup.findMany({
      include: {
        students: {
          where: { deleted_at: null },
          select: {
            id: true, name_en: true, student_uid: true, photo_url: true,
            current_class: { select: { name_en: true } },
            current_section: { select: { name: true } },
          },
        },
      },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: groups });
  }),
);

// GET /sibling-groups/:id
siblingGroupRouter.get(
  "/:id",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const group = await prisma.siblingGroup.findUnique({
      where: { id },
      include: {
        students: {
          where: { deleted_at: null },
          select: { id: true, name_en: true, student_uid: true, current_class: { select: { name_en: true } } },
        },
      },
    });
    if (!group) throw notFound("Sibling group not found");
    res.json({ success: true, data: group });
  }),
);

// PATCH /sibling-groups/:id — update the waiver % or add/remove members.
const updateSiblingGroupSchema = z.object({
  auto_waiver_percentage: z.number().min(0).max(100).optional(),
  add_student_ids: z.array(z.string()).optional(),
  remove_student_ids: z.array(z.string()).optional(),
});

siblingGroupRouter.patch(
  "/:id",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = updateSiblingGroupSchema.parse(req.body);

    const group = await prisma.siblingGroup.findUnique({ where: { id } });
    if (!group) throw notFound("Sibling group not found");

    await prisma.$transaction(async (tx) => {
      if (body.auto_waiver_percentage !== undefined) {
        await tx.siblingGroup.update({ where: { id }, data: { auto_waiver_percentage: body.auto_waiver_percentage } });
      }

      if (body.add_student_ids?.length) {
        await tx.student.updateMany({ where: { id: { in: body.add_student_ids } }, data: { sibling_group_id: id } });
      }

      if (body.remove_student_ids?.length) {
        await tx.student.updateMany({ where: { id: { in: body.remove_student_ids } }, data: { sibling_group_id: null } });
      }
    });

    const updated = await prisma.siblingGroup.findUnique({
      where: { id },
      include: { students: { where: { deleted_at: null }, select: { id: true, name_en: true } } },
    });

    res.json({ success: true, data: updated });
  }),
);

// DELETE /sibling-groups/:id — dissolves the group, unlinks all members.
siblingGroupRouter.delete(
  "/:id",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const group = await prisma.siblingGroup.findUnique({ where: { id } });
    if (!group) throw notFound("Sibling group not found");

    await prisma.$transaction(async (tx) => {
      await tx.student.updateMany({ where: { sibling_group_id: id }, data: { sibling_group_id: null } });
      await tx.siblingGroup.delete({ where: { id } });
    });

    res.json({ success: true, data: { id } });
  }),
);
