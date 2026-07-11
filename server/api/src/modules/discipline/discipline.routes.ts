import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { DISCIPLINE_MANAGE_ROLES } from "../../lib/roles";
import { disciplineRecordSchema } from "@education-erp/validators";
import { logAudit } from "../../lib/audit-log";
import { assertClassTeacherOfStudent } from "../../lib/class-teacher-ownership";

// Staff-only (ADMIN/PRINCIPAL/CLASS_TEACHER) — mirrors the legacy scope
// exactly: never surfaced in the STUDENT/GUARDIAN portal.
export const disciplineRouter = Router();
disciplineRouter.use(authenticate, authorize(DISCIPLINE_MANAGE_ROLES));

disciplineRouter.get(
  "/student/:student_id",
  asyncHandler(async (req, res) => {
    const studentId = reqParam(req, "student_id");
    await assertClassTeacherOfStudent(req.user!.sub, req.user!.role, studentId);
    const records = await prisma.disciplineRecord.findMany({ where: { student_id: studentId }, orderBy: { occurred_at: "desc" } });
    res.json({ success: true, data: records });
  }),
);

disciplineRouter.post(
  "/student/:student_id",
  asyncHandler(async (req, res) => {
    const studentId = reqParam(req, "student_id");
    await assertClassTeacherOfStudent(req.user!.sub, req.user!.role, studentId);
    const body = disciplineRecordSchema.parse(req.body);
    const record = await prisma.disciplineRecord.create({
      data: { student_id: studentId, ...body, recorded_by_id: req.user!.sub },
    });
    await logAudit("DISCIPLINE_RECORD_CREATE", { userId: req.user!.sub, targetType: "DisciplineRecord", targetId: record.id, metadata: { student_id: studentId, category: body.category }, req });
    res.status(201).json({ success: true, data: record });
  }),
);
