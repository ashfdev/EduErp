import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { SETTINGS_ACADEMIC_ROLES } from "../../lib/roles";
import { subjectSchema, subjectAssignmentSchema } from "@education-erp/validators";
import { conflict, notFound } from "../../lib/errors";

export const subjectsRouter = Router();
subjectsRouter.use(authenticate);

// Defensive: two active subject rows can share a display name (only
// (class_id, code) is unique at the DB level) — legacy rows created before
// assertNoDuplicateName existed, or a future gap in that guard, would
// otherwise render as visually-identical duplicate columns/cards everywhere
// this list is consumed (Settings > Subjects, mark entry, exam config).
function dedupeByName<T extends { name_en: string }>(rows: T[]): T[] {
  const seenNames = new Set<string>();
  return rows.filter((r) => {
    const k = r.name_en.trim().toLowerCase();
    if (seenNames.has(k)) return false;
    seenNames.add(k);
    return true;
  });
}

subjectsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z.object({ class_id: z.string().optional() }).parse(req.query);
    const subjects = await prisma.subject.findMany({
      where: { is_active: true, ...(query.class_id && { class_id: query.class_id }) },
      orderBy: [{ created_at: "asc" }, { display_order: "asc" }],
    });
    res.json({ success: true, data: dedupeByName(subjects) });
  }),
);

// Read-only diagnostic for Settings > Subjects — surfaces any legacy
// duplicate-name pair for manual admin review. Never auto-merged: two
// Subject rows can each carry their own MarkEntry/SubjectTeacherAssignment/
// StudentSubject history, and reconciling that automatically would be a
// real data-integrity decision, not a display fix.
subjectsRouter.get(
  "/duplicates",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (_req, res) => {
    const subjects = await prisma.subject.findMany({
      where: { is_active: true },
      include: { class: { select: { name_en: true } } },
      orderBy: { created_at: "asc" },
    });
    const groups = new Map<string, typeof subjects>();
    for (const s of subjects) {
      const k = `${s.class_id}:${s.name_en.trim().toLowerCase()}`;
      groups.set(k, [...(groups.get(k) ?? []), s]);
    }
    const duplicates = [...groups.values()].filter((g) => g.length > 1);
    res.json({ success: true, data: duplicates });
  }),
);

// Same-name subjects (different codes) render as visually-identical, confusing
// duplicate columns everywhere the subject list is used (mark entry, exam
// config) even though they're technically distinct rows — only (class_id,
// code) is unique at the DB level, so this is enforced here instead.
async function assertNoDuplicateName(classId: string, nameEn: string, excludeId?: string) {
  const clash = await prisma.subject.findFirst({
    where: {
      class_id: classId,
      is_active: true,
      name_en: { equals: nameEn, mode: "insensitive" },
      ...(excludeId && { id: { not: excludeId } }),
    },
  });
  if (clash) throw conflict("A subject with this name already exists in this class");
}

subjectsRouter.post(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = subjectSchema.parse(req.body);
    body.name_en = body.name_en.trim();
    const existing = await prisma.subject.findUnique({ where: { class_id_code: { class_id: body.class_id, code: body.code } } });
    if (existing) throw conflict("A subject with this code already exists in this class");
    await assertNoDuplicateName(body.class_id, body.name_en);

    const subject = await prisma.subject.create({ data: body });
    res.status(201).json({ success: true, data: subject });
  }),
);

subjectsRouter.put(
  "/reorder",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = z.array(z.object({ id: z.string(), display_order: z.number().int() })).parse(req.body);
    await prisma.$transaction(
      body.map((item) => prisma.subject.update({ where: { id: item.id }, data: { display_order: item.display_order } })),
    );
    res.json({ success: true, message: "Order updated" });
  }),
);

subjectsRouter.put(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = subjectSchema.partial().parse(req.body);
    if (body.name_en) {
      body.name_en = body.name_en.trim();
      const existing = await prisma.subject.findUniqueOrThrow({ where: { id } });
      await assertNoDuplicateName(body.class_id ?? existing.class_id, body.name_en, id);
    }
    const subject = await prisma.subject.update({ where: { id }, data: body });
    res.json({ success: true, data: subject });
  }),
);

subjectsRouter.delete(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const hasMarks = await prisma.markEntry.findFirst({ where: { subject_id: id } });
    if (hasMarks) throw conflict("This subject has exam records and cannot be deleted");
    await prisma.subject.update({ where: { id }, data: { is_active: false } });
    res.status(204).send();
  }),
);

subjectsRouter.get(
  "/:id/assignments",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const query = z.object({ academic_year_id: z.string().optional() }).parse(req.query);
    const assignments = await prisma.subjectTeacherAssignment.findMany({
      where: { subject_id: id, ...(query.academic_year_id && { academic_year_id: query.academic_year_id }) },
      include: { staff: { select: { id: true, name_en: true, designation: true } }, subject: true },
    });
    res.json({ success: true, data: assignments });
  }),
);

subjectsRouter.post(
  "/assign",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = subjectAssignmentSchema.parse(req.body);
    const assignment = await prisma.subjectTeacherAssignment.create({ data: body });
    res.status(201).json({ success: true, data: assignment });
  }),
);

subjectsRouter.put(
  "/assign/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = z.object({ staff_id: z.string().min(1) }).parse(req.body);
    const assignment = await prisma.subjectTeacherAssignment.update({ where: { id }, data: body });
    res.json({ success: true, data: assignment });
  }),
);

subjectsRouter.delete(
  "/assign/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.subjectTeacherAssignment.findUnique({ where: { id } });
    if (!existing) throw notFound("Assignment not found");
    await prisma.subjectTeacherAssignment.delete({ where: { id } });
    res.status(204).send();
  }),
);
