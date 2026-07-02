import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";

export const staffRouter = Router();
staffRouter.use(authenticate);

const TEACHING_ROLES = ["CLASS_TEACHER", "SUBJECT_TEACHER", "HEAD_OF_DEPT"] as const;

// Minimal read-only endpoint — full HR/staff CRUD lands in Phase 12.
staffRouter.get(
  "/teachers",
  asyncHandler(async (_req, res) => {
    const teachers = await prisma.staff.findMany({
      where: { is_active: true, user: { role: { in: [...TEACHING_ROLES] } } },
      select: { id: true, name_en: true, designation: true, department_id: true, user: { select: { role: true } } },
      orderBy: { name_en: "asc" },
    });
    res.json({ success: true, data: teachers });
  }),
);
