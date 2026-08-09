import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { TEACHING_ROLES, STAFF_ONLY_ROLES } from "../../lib/roles";

export const staffRouter = Router();
staffRouter.use(authenticate);

// Minimal read-only endpoint — full HR/staff CRUD lands in Phase 12.
// department_id/subject_id are optional narrowing filters for the
// substitute-teacher picker (Plan Fourteen, Phase C1) — subject_id already
// correctly handles group-scoping "for free" since a group-scoped Subject
// row is distinct per Group, so a teacher's SubjectTeacherAssignment for
// that exact subject_id already implies the right group.
staffRouter.get(
  "/teachers",
  asyncHandler(async (req, res) => {
    const query = z.object({ department_id: z.string().optional(), subject_id: z.string().optional() }).parse(req.query);
    const teachers = await prisma.staff.findMany({
      where: {
        is_active: true,
        deleted_at: null,
        user: { role: { in: TEACHING_ROLES } },
        ...(query.department_id && { department_id: query.department_id }),
        ...(query.subject_id && { subject_assignments: { some: { subject_id: query.subject_id } } }),
      },
      select: { id: true, name_en: true, designation: true, department_id: true, user: { select: { role: true } } },
      orderBy: { name_en: "asc" },
    });
    res.json({ success: true, data: teachers });
  }),
);

// Teacher assignment overview (2026-08-09) — real gap found during a full-
// system audit: no single place showed which teacher teaches which subject
// in which class/section, with contact info, all together — the closest
// thing was /api/analytics/teacher-workload, which only ever returned
// aggregate counts (a number of classes/subjects), never names, and had no
// frontend caller at all. This is a fresh, name-bearing overview: one row
// per teacher with their staff ID and phone, plus a flattened list of every
// real class/section/subject assignment. Staff-only (phone numbers), not
// the broader "any authenticated account" gate /teachers above uses.
staffRouter.get(
  "/assignments-overview",
  authorize(STAFF_ONLY_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ search: z.string().optional(), department_id: z.string().optional() }).parse(req.query);
    const teachers = await prisma.staff.findMany({
      where: {
        is_active: true,
        deleted_at: null,
        user: { role: { in: TEACHING_ROLES } },
        ...(query.department_id && { department_id: query.department_id }),
        ...(query.search && {
          OR: [
            { name_en: { contains: query.search, mode: "insensitive" } },
            { staff_uid: { contains: query.search, mode: "insensitive" } },
            { phone: { contains: query.search, mode: "insensitive" } },
          ],
        }),
      },
      select: {
        id: true,
        name_en: true,
        staff_uid: true,
        phone: true,
        designation: true,
        user: { select: { role: true } },
        subject_assignments: {
          select: {
            section_id: true,
            subject: { select: { name_en: true, class: { select: { name_en: true } } } },
          },
        },
      },
      orderBy: { name_en: "asc" },
    });

    // SubjectTeacherAssignment carries a plain section_id scalar, not a
    // `section` relation — resolve names in one batched lookup instead of
    // an N+1 per assignment.
    const sectionIds = [...new Set(teachers.flatMap((t) => t.subject_assignments.map((a) => a.section_id).filter((id): id is string => !!id)))];
    const sections = sectionIds.length ? await prisma.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, name: true } }) : [];
    const sectionNameById = new Map(sections.map((s) => [s.id, s.name]));

    const data = teachers.map((t) => ({
      staff_id: t.id,
      name_en: t.name_en,
      staff_uid: t.staff_uid,
      phone: t.phone,
      designation: t.designation,
      role: t.user.role,
      assignments: t.subject_assignments.map((a) => ({
        class_name: a.subject.class.name_en,
        // null section_id on the assignment itself means "whole class" —
        // the same convention every other consumer of this table uses.
        section_name: a.section_id ? (sectionNameById.get(a.section_id) ?? "Unknown Section") : "Whole Class",
        subject_name: a.subject.name_en,
      })),
    }));

    res.json({ success: true, data });
  }),
);
