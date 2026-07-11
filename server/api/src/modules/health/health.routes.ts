import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { HEALTH_MANAGE_ROLES } from "../../lib/roles";
import { healthProfileSchema, healthIncidentSchema } from "@education-erp/validators";
import { logAudit } from "../../lib/audit-log";
import { assertClassTeacherOfStudent } from "../../lib/class-teacher-ownership";

// Staff-only (ADMIN/PRINCIPAL/CLASS_TEACHER) — medical data, never surfaced
// to the STUDENT/GUARDIAN portal in this pass, same boundary as discipline.
export const studentHealthRouter = Router();
studentHealthRouter.use(authenticate, authorize(HEALTH_MANAGE_ROLES));

studentHealthRouter.get(
  "/student/:student_id",
  asyncHandler(async (req, res) => {
    const studentId = reqParam(req, "student_id");
    await assertClassTeacherOfStudent(req.user!.sub, req.user!.role, studentId);
    const [profile, incidents] = await Promise.all([
      prisma.studentHealthProfile.findUnique({ where: { student_id: studentId } }),
      prisma.healthIncident.findMany({ where: { student_id: studentId }, orderBy: { date: "desc" } }),
    ]);
    res.json({ success: true, data: { profile, incidents } });
  }),
);

studentHealthRouter.put(
  "/student/:student_id/profile",
  asyncHandler(async (req, res) => {
    const studentId = reqParam(req, "student_id");
    await assertClassTeacherOfStudent(req.user!.sub, req.user!.role, studentId);
    const body = healthProfileSchema.parse(req.body);
    const profile = await prisma.studentHealthProfile.upsert({
      where: { student_id: studentId },
      create: { student_id: studentId, ...body },
      update: body,
    });
    await logAudit("HEALTH_RECORD_CREATE", { userId: req.user!.sub, targetType: "StudentHealthProfile", targetId: profile.id, metadata: { student_id: studentId }, req });
    res.json({ success: true, data: profile });
  }),
);

studentHealthRouter.post(
  "/student/:student_id/incidents",
  asyncHandler(async (req, res) => {
    const studentId = reqParam(req, "student_id");
    await assertClassTeacherOfStudent(req.user!.sub, req.user!.role, studentId);
    const body = healthIncidentSchema.parse(req.body);
    const incident = await prisma.healthIncident.create({
      data: { student_id: studentId, ...body, recorded_by_id: req.user!.sub },
    });
    await logAudit("HEALTH_RECORD_CREATE", { userId: req.user!.sub, targetType: "HealthIncident", targetId: incident.id, metadata: { student_id: studentId }, req });
    res.status(201).json({ success: true, data: incident });
  }),
);
