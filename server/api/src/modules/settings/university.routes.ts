import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { SETTINGS_ACADEMIC_ROLES } from "../../lib/roles";
import { programSchema, courseSchema, prerequisiteSchema } from "@education-erp/validators";
import { badRequest, conflict, notFound } from "../../lib/errors";

export const programsRouter = Router();
export const coursesRouter = Router();

for (const r of [programsRouter, coursesRouter]) {
  r.use(authenticate);
}

// ── Programs ─────────────────────────────────────────────────────

programsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const programs = await prisma.program.findMany({
      include: { department: { select: { name_en: true } }, _count: { select: { courses: true } } },
      orderBy: { name_en: "asc" },
    });
    res.json({ success: true, data: programs });
  }),
);

programsRouter.post(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = programSchema.parse(req.body);
    const program = await prisma.program.create({ data: body });
    res.status(201).json({ success: true, data: program });
  }),
);

programsRouter.put(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = programSchema.partial().parse(req.body);
    const program = await prisma.program.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: program });
  }),
);

programsRouter.delete(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const hasCourses = await prisma.course.findFirst({ where: { program_id: reqParam(req, "id") } });
    if (hasCourses) throw conflict("This program has courses and cannot be deleted");
    await prisma.program.delete({ where: { id: reqParam(req, "id") } });
    res.status(204).send();
  }),
);

// ── Courses ──────────────────────────────────────────────────────

coursesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const program_id = req.query.program_id as string | undefined;
    const courses = await prisma.course.findMany({
      where: program_id ? { program_id } : undefined,
      include: {
        program: { select: { name_en: true } },
        required_by: { include: { prerequisite_course: { select: { id: true, code: true, name_en: true } } } },
      },
      orderBy: [{ semester_number: "asc" }, { code: "asc" }],
    });
    res.json({ success: true, data: courses });
  }),
);

coursesRouter.post(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = courseSchema.parse(req.body);
    const course = await prisma.course.create({ data: body });
    res.status(201).json({ success: true, data: course });
  }),
);

coursesRouter.put(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = courseSchema.partial().parse(req.body);
    const course = await prisma.course.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: course });
  }),
);

coursesRouter.delete(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const hasEnrollments = await prisma.courseEnrollment.findFirst({ where: { course_id: reqParam(req, "id") } });
    if (hasEnrollments) throw conflict("This course has student enrollments and cannot be deleted");
    await prisma.course.delete({ where: { id: reqParam(req, "id") } });
    res.status(204).send();
  }),
);

// Walks the prerequisite graph forward from `fromCourseId` — used to reject
// an edge that would create a cycle (A requires B, B (transitively)
// requires A) before it's written, rather than discovering it later.
async function wouldCreateCycle(fromCourseId: string, targetCourseId: string): Promise<boolean> {
  const visited = new Set<string>();
  const queue = [fromCourseId];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === targetCourseId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const edges = await prisma.prerequisite.findMany({ where: { course_id: current }, select: { prerequisite_course_id: true } });
    queue.push(...edges.map((e) => e.prerequisite_course_id));
  }
  return false;
}

coursesRouter.get(
  "/:id/prerequisites",
  asyncHandler(async (req, res) => {
    const prerequisites = await prisma.prerequisite.findMany({
      where: { course_id: reqParam(req, "id") },
      include: { prerequisite_course: { select: { id: true, code: true, name_en: true, semester_number: true } } },
    });
    res.json({ success: true, data: prerequisites });
  }),
);

coursesRouter.post(
  "/:id/prerequisites",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const courseId = reqParam(req, "id");
    const body = prerequisiteSchema.parse(req.body);
    if (body.prerequisite_course_id === courseId) throw badRequest("A course cannot be its own prerequisite");

    const target = await prisma.course.findUnique({ where: { id: body.prerequisite_course_id } });
    if (!target) throw notFound("Prerequisite course not found");

    // Cycle check: does the course being added AS a prerequisite already
    // (transitively) require courseId? If so, this edge would create a loop.
    if (await wouldCreateCycle(body.prerequisite_course_id, courseId)) {
      throw badRequest("This would create a prerequisite cycle");
    }

    const prerequisite = await prisma.prerequisite.create({
      data: { course_id: courseId, prerequisite_course_id: body.prerequisite_course_id },
    });
    res.status(201).json({ success: true, data: prerequisite });
  }),
);

coursesRouter.delete(
  "/:id/prerequisites/:prerequisite_id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.prerequisite.delete({ where: { id: reqParam(req, "prerequisite_id") } });
    res.status(204).send();
  }),
);
