import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { TEACHING_ROLES } from "../../lib/roles";

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
