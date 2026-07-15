import { Router } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { DISCIPLINE_MANAGE_ROLES } from "../../lib/roles";
import { disciplineRecordSchema } from "@education-erp/validators";
import { logAudit } from "../../lib/audit-log";
import { assertClassTeacherOfStudent } from "../../lib/class-teacher-ownership";
import { forbidden } from "../../lib/errors";

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

// Class/date-range-wide report — the single-student route above was the
// only list endpoint until now. CLASS_TEACHER is scoped to their own
// section(s) only (mirrors assertClassTeacherOfStudent's own ADMIN/
// SUPER_ADMIN/PRINCIPAL-bypass rule), never able to widen the query past
// what they're allowed to see one student at a time.
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
    ...(query.from_date || query.to_date ? { occurred_at: { ...(query.from_date && { gte: query.from_date }), ...(query.to_date && { lte: query.to_date }) } } : {}),
    student: {
      ...(query.class_id && { current_class_id: query.class_id }),
      ...(sectionFilter && { current_section_id: sectionFilter }),
    },
  };
}

disciplineRouter.get(
  "/reports",
  asyncHandler(async (req, res) => {
    const where = await buildReportsWhere(req);
    const records = await prisma.disciplineRecord.findMany({
      where,
      include: { student: { select: { name_en: true, student_uid: true, current_class: { select: { name_en: true } }, current_section: { select: { name: true } } } } },
      orderBy: { occurred_at: "desc" },
    });
    res.json({ success: true, data: records });
  }),
);

disciplineRouter.get(
  "/reports/export",
  asyncHandler(async (req, res) => {
    const where = await buildReportsWhere(req);
    const records = await prisma.disciplineRecord.findMany({
      where,
      include: { student: { select: { name_en: true, student_uid: true, current_class: { select: { name_en: true } }, current_section: { select: { name: true } } } } },
      orderBy: { occurred_at: "desc" },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Discipline Records");
    sheet.columns = [
      { header: "Student ID", key: "student_uid", width: 16 },
      { header: "Name", key: "name_en", width: 22 },
      { header: "Class", key: "class_name", width: 14 },
      { header: "Section", key: "section_name", width: 12 },
      { header: "Category", key: "category", width: 14 },
      { header: "Description", key: "description", width: 36 },
      { header: "Action Taken", key: "action_taken", width: 24 },
      { header: "Occurred At", key: "occurred_at", width: 14 },
    ];
    for (const r of records) {
      sheet.addRow({
        student_uid: r.student.student_uid,
        name_en: r.student.name_en,
        class_name: r.student.current_class?.name_en ?? "",
        section_name: r.student.current_section?.name ?? "",
        category: r.category,
        description: r.description,
        action_taken: r.action_taken ?? "",
        occurred_at: r.occurred_at.toISOString().slice(0, 10),
      });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="Discipline_Records.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  }),
);
