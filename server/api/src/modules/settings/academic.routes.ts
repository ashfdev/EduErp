import { Router } from "express";
import { reqParam } from "../../lib/req-param";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { SETTINGS_ACADEMIC_ROLES } from "../../lib/roles";
import { academicYearSchema, shiftSchema, departmentSchema, classSchema, sectionSchema } from "@education-erp/validators";
import { conflict } from "../../lib/errors";

export const academicYearsRouter = Router();
export const shiftsRouter = Router();
export const departmentsRouter = Router();
export const classesRouter = Router();
export const sectionsRouter = Router();

for (const r of [academicYearsRouter, shiftsRouter, departmentsRouter, classesRouter, sectionsRouter]) {
  r.use(authenticate);
}

// ── Academic Years ──────────────────────────────────────────────

academicYearsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const years = await prisma.academicYear.findMany({ orderBy: { start_date: "desc" } });
    res.json({ success: true, data: years });
  }),
);

academicYearsRouter.post(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = academicYearSchema.parse(req.body);
    const year = await prisma.academicYear.create({ data: body });
    res.status(201).json({ success: true, data: year });
  }),
);

academicYearsRouter.put(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = academicYearSchema.partial().parse(req.body);
    const year = await prisma.academicYear.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: year });
  }),
);

academicYearsRouter.post(
  "/:id/activate",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.$transaction([
      prisma.academicYear.updateMany({ data: { is_active: false }, where: {} }),
      prisma.academicYear.update({ where: { id: reqParam(req, "id") }, data: { is_active: true } }),
    ]);
    res.json({ success: true, message: "Active academic year updated" });
  }),
);

academicYearsRouter.delete(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const hasClasses = await prisma.class.findFirst({ where: { academic_year_id: reqParam(req, "id") } });
    if (hasClasses) throw conflict("This academic year has classes and cannot be deleted");
    await prisma.academicYear.delete({ where: { id: reqParam(req, "id") } });
    res.status(204).send();
  }),
);

// ── Shifts ───────────────────────────────────────────────────────

shiftsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const shifts = await prisma.shift.findMany({ orderBy: { start_time: "asc" } });
    res.json({ success: true, data: shifts });
  }),
);

shiftsRouter.post(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = shiftSchema.parse(req.body);
    const shift = await prisma.shift.create({ data: body });
    res.status(201).json({ success: true, data: shift });
  }),
);

shiftsRouter.put(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = shiftSchema.partial().parse(req.body);
    const shift = await prisma.shift.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: shift });
  }),
);

shiftsRouter.delete(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.shift.delete({ where: { id: reqParam(req, "id") } });
    res.status(204).send();
  }),
);

// ── Departments ──────────────────────────────────────────────────

departmentsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const departments = await prisma.department.findMany({
      include: { head: { select: { id: true, name_en: true } } },
      orderBy: { name_en: "asc" },
    });
    res.json({ success: true, data: departments });
  }),
);

departmentsRouter.post(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = departmentSchema.parse(req.body);
    const department = await prisma.department.create({ data: body });
    res.status(201).json({ success: true, data: department });
  }),
);

departmentsRouter.put(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = departmentSchema.partial().parse(req.body);
    const department = await prisma.department.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: department });
  }),
);

departmentsRouter.delete(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.department.delete({ where: { id: reqParam(req, "id") } });
    res.status(204).send();
  }),
);

departmentsRouter.put(
  "/:id/head",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = z.object({ head_id: z.string().nullable() }).parse(req.body);
    const department = await prisma.department.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: department });
  }),
);

// ── Classes ──────────────────────────────────────────────────────

classesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const academic_year_id = req.query.academic_year_id as string | undefined;
    const classes = await prisma.class.findMany({
      where: academic_year_id ? { academic_year_id } : undefined,
      include: {
        sections: { include: { _count: { select: { students: true } } } },
        _count: { select: { students: true } },
      },
      orderBy: { numeric_level: "asc" },
    });
    res.json({ success: true, data: classes });
  }),
);

classesRouter.post(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = classSchema.parse(req.body);
    const klass = await prisma.class.create({ data: body });
    res.status(201).json({ success: true, data: klass });
  }),
);

classesRouter.put(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = classSchema.partial().parse(req.body);
    const klass = await prisma.class.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: klass });
  }),
);

classesRouter.delete(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const hasStudents = await prisma.student.findFirst({ where: { current_class_id: reqParam(req, "id") } });
    if (hasStudents) throw conflict("This class has enrolled students and cannot be deleted");
    await prisma.class.delete({ where: { id: reqParam(req, "id") } });
    res.status(204).send();
  }),
);

classesRouter.post(
  "/:class_id/sections",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = sectionSchema.parse(req.body);
    const section = await prisma.section.create({ data: { ...body, class_id: reqParam(req, "class_id") } });
    res.status(201).json({ success: true, data: section });
  }),
);

// ── Sections ─────────────────────────────────────────────────────

sectionsRouter.put(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = sectionSchema.partial().parse(req.body);
    const section = await prisma.section.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: section });
  }),
);

sectionsRouter.delete(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const hasStudents = await prisma.student.findFirst({ where: { current_section_id: reqParam(req, "id") } });
    if (hasStudents) throw conflict("This section has enrolled students and cannot be deleted");
    await prisma.section.delete({ where: { id: reqParam(req, "id") } });
    res.status(204).send();
  }),
);

sectionsRouter.put(
  "/:id/class-teacher",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = z.object({ class_teacher_id: z.string().nullable() }).parse(req.body);
    const section = await prisma.section.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: section });
  }),
);
