import { Router } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { HEALTH_MANAGE_ROLES } from "../../lib/roles";
import { healthProfileSchema, healthIncidentSchema } from "@education-erp/validators";
import { logAudit } from "../../lib/audit-log";
import { assertClassTeacherOfStudent } from "../../lib/class-teacher-ownership";
import { registerBatchJobKind, enqueueBatchJob, EXCEL_EXPORT_BATCH_THRESHOLD, type BatchJobResult } from "../../lib/batch-job-registry";
import { forbidden } from "../../lib/errors";

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

// Class/date-range-wide incident report — mirrors discipline.routes.ts's
// own reports/export addition exactly, including CLASS_TEACHER's own-
// section-only scoping (never able to widen past what they can see one
// student at a time via assertClassTeacherOfStudent).
const reportsQuerySchema = z.object({
  class_id: z.string().optional(),
  section_id: z.string().optional(),
  from_date: z.coerce.date().optional(),
  to_date: z.coerce.date().optional(),
});

async function buildReportsWhere(req: import("express").Request) {
  const query = reportsQuerySchema.parse(req.query);
  const role = req.user!.role;

  let sectionFilter: string | { in: string[] } | undefined = query.section_id;
  if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "PRINCIPAL") {
    const staff = await prisma.staff.findFirst({ where: { user_id: req.user!.sub } });
    const ownSections = staff ? await prisma.section.findMany({ where: { class_teacher_id: staff.id }, select: { id: true } }) : [];
    const ownSectionIds = ownSections.map((s) => s.id);
    if (query.section_id && !ownSectionIds.includes(query.section_id)) throw forbidden("You are not the class teacher for this section");
    sectionFilter = query.section_id ?? { in: ownSectionIds };
  }

  return {
    ...(query.from_date || query.to_date ? { date: { ...(query.from_date && { gte: query.from_date }), ...(query.to_date && { lte: query.to_date }) } } : {}),
    student: {
      ...(query.class_id && { current_class_id: query.class_id }),
      ...(sectionFilter && { current_section_id: sectionFilter }),
    },
  };
}

studentHealthRouter.get(
  "/reports",
  asyncHandler(async (req, res) => {
    const where = await buildReportsWhere(req);
    const incidents = await prisma.healthIncident.findMany({
      where,
      include: { student: { select: { name_en: true, student_uid: true, current_class: { select: { name_en: true } }, current_section: { select: { name: true } } } } },
      orderBy: { date: "desc" },
    });
    res.json({ success: true, data: incidents });
  }),
);

// Plan Twenty (large-batch background jobs), extended to this Excel export.
// Takes the already-resolved `where` (built once, synchronously, by
// buildReportsWhere above -- including its CLASS_TEACHER own-section
// permission check) rather than the raw request, since that check has no
// meaningful "caller" to re-run against inside a background worker; the
// authorization decision is snapshotted at request time, same discipline
// already used by the admit-card override system. Prisma's DateTimeFilter
// accepts a plain ISO string as well as a real Date, so the where object
// round-trips through the job's JSON params column with no reconstruction
// needed.
async function buildHealthIncidentsExportJob(where: Awaited<ReturnType<typeof buildReportsWhere>>): Promise<BatchJobResult> {
  const incidents = await prisma.healthIncident.findMany({
    where,
    include: { student: { select: { name_en: true, student_uid: true, current_class: { select: { name_en: true } }, current_section: { select: { name: true } } } } },
    orderBy: { date: "desc" },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Health Incidents");
  sheet.columns = [
    { header: "Student ID", key: "student_uid", width: 16 },
    { header: "Name", key: "name_en", width: 22 },
    { header: "Class", key: "class_name", width: 14 },
    { header: "Section", key: "section_name", width: 12 },
    { header: "Description", key: "description", width: 36 },
    { header: "Action Taken", key: "action_taken", width: 24 },
    { header: "Date", key: "date", width: 14 },
  ];
  for (const i of incidents) {
    sheet.addRow({
      student_uid: i.student.student_uid,
      name_en: i.student.name_en,
      class_name: i.student.current_class?.name_en ?? "",
      section_name: i.student.current_section?.name ?? "",
      description: i.description,
      action_taken: i.action_taken ?? "",
      date: i.date.toISOString().slice(0, 10),
    });
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename: "Health_Incidents.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}
registerBatchJobKind("HEALTH_INCIDENTS_EXPORT", "HEALTH_INCIDENTS_EXPORT", (params) =>
  buildHealthIncidentsExportJob(params as Awaited<ReturnType<typeof buildReportsWhere>>),
);

studentHealthRouter.get(
  "/reports/export",
  asyncHandler(async (req, res) => {
    const where = await buildReportsWhere(req);
    const count = await prisma.healthIncident.count({ where });
    if (count <= EXCEL_EXPORT_BATCH_THRESHOLD) {
      const { buffer, filename, mimeType } = await buildHealthIncidentsExportJob(where);
      res.setHeader("Content-Type", mimeType!);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
      return;
    }
    const job = await enqueueBatchJob("HEALTH_INCIDENTS_EXPORT", where, req.user!.sub);
    res.status(202).json({ success: true, data: { job_id: job.id, status: job.status } });
  }),
);
