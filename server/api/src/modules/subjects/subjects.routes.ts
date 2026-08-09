import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { SETTINGS_ACADEMIC_ROLES } from "../../lib/roles";
import { subjectSchema, subjectAssignmentSchema } from "@education-erp/validators";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { resolveAssignedSubjectIds } from "../../lib/subject-teacher-assignment";
import { assertNoTeacherClash } from "../settings/academic.routes";

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
    const query = z.object({ class_id: z.string().optional(), assigned_only: z.coerce.boolean().optional() }).parse(req.query);
    // assigned_only narrows the result to subjects the caller actually has a
    // SubjectTeacherAssignment for -- opt-in, since every other consumer of
    // this endpoint (admin panels, other pickers) still wants the full,
    // unfiltered class subject list exactly as before. Shares its resolution
    // logic with quizzes.routes.ts's ownership check, so a teacher can never
    // be offered a subject here that create-side would then reject.
    const assignedSubjectIds = query.assigned_only ? await resolveAssignedSubjectIds(req.user!.sub) : undefined;
    const subjects = await prisma.subject.findMany({
      where: {
        is_active: true,
        ...(query.class_id && { class_id: query.class_id }),
        ...(assignedSubjectIds && { id: { in: assignedSubjectIds } }),
      },
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

// Previously only enforced client-side (the Settings form's own Switch pair)
// — bypassable via a direct API call or any future bulk-edit path. A subject
// flagged both ways would make inheritSubjectsForClass() unconditionally add
// it as compulsory regardless of any student's optional-subject selection,
// producing the exact "deselected subject still shows up" symptom this
// codebase has already seen once from a different root cause.
function assertNotBothCompulsoryAndOptional(isCompulsory: boolean, isOptional: boolean) {
  if (isCompulsory && isOptional) {
    throw badRequest("A subject cannot be both compulsory and optional at the same time");
  }
}

subjectsRouter.post(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = subjectSchema.parse(req.body);
    body.name_en = body.name_en.trim();
    assertNotBothCompulsoryAndOptional(body.is_compulsory, body.is_optional);
    const existing = await prisma.subject.findUnique({ where: { class_id_code: { class_id: body.class_id, code: body.code } } });
    if (existing) throw conflict("A subject with this code already exists in this class");
    await assertNoDuplicateName(body.class_id, body.name_en);
    if (body.group_id) {
      const group = await prisma.group.findFirst({ where: { id: body.group_id, class_id: body.class_id } });
      if (!group) throw badRequest("The selected group does not belong to this class");
    }

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
    if (body.is_compulsory !== undefined || body.is_optional !== undefined) {
      const existing = await prisma.subject.findUniqueOrThrow({ where: { id } });
      assertNotBothCompulsoryAndOptional(body.is_compulsory ?? existing.is_compulsory, body.is_optional ?? existing.is_optional);
    }
    if (body.name_en) {
      body.name_en = body.name_en.trim();
      const existing = await prisma.subject.findUniqueOrThrow({ where: { id } });
      await assertNoDuplicateName(body.class_id ?? existing.class_id, body.name_en, id);
    }
    if (body.group_id) {
      const existing = await prisma.subject.findUniqueOrThrow({ where: { id } });
      const group = await prisma.group.findFirst({ where: { id: body.group_id, class_id: body.class_id ?? existing.class_id } });
      if (!group) throw badRequest("The selected group does not belong to this class");
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

// Real bug fixed (Plan Twenty-Seven, item 5): the DB's own
// @@unique([subject_id, section_id, academic_year_id]) does NOT prevent a
// whole-class (section_id: null) assignment and a section-specific
// assignment from coexisting for the same subject+year -- Postgres never
// treats a NULL as equal to anything, including another NULL, for
// uniqueness purposes. Left unchecked, this meant a section already fully
// covered by a whole-class assignment could silently gain a SECOND,
// different teacher via a section-specific assignment (or vice versa),
// with both simultaneously passing hasSubjectTeacherAssignment()'s OR-based
// check -- exactly the "already assigned, but I could still assign someone
// else" bug reported directly. Soft-warning-with-override, matching this
// codebase's own established convention (section-capacity, credit-hour
// cap, fee-structure overlap) rather than a hard block, since a genuine
// temporary co-teaching arrangement is a real, if uncommon, case.
async function findAssignmentOverlap(subjectId: string, sectionId: string | null, academicYearId: string, excludeStaffId?: string) {
  const where = sectionId
    // Adding a section-specific row -- conflicts with an existing
    // whole-class (null-section) row for a DIFFERENT teacher.
    ? { subject_id: subjectId, academic_year_id: academicYearId, section_id: null, ...(excludeStaffId ? { staff_id: { not: excludeStaffId } } : {}) }
    // Adding a whole-class row -- conflicts with ANY existing
    // section-specific row (or another whole-class row) for a DIFFERENT teacher.
    : { subject_id: subjectId, academic_year_id: academicYearId, ...(excludeStaffId ? { staff_id: { not: excludeStaffId } } : {}) };
  return prisma.subjectTeacherAssignment.findFirst({
    where,
    include: { staff: { select: { name_en: true } } },
  });
}

subjectsRouter.post(
  "/assign",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const { override, ...body } = subjectAssignmentSchema.parse(req.body);

    if (!override) {
      const conflictRow = await findAssignmentOverlap(body.subject_id, body.section_id ?? null, body.academic_year_id, body.staff_id);
      if (conflictRow) {
        const message = body.section_id
          ? `This subject already has a whole-class teacher assigned (${conflictRow.staff.name_en}) -- adding a section-specific teacher would mean two teachers are both assigned for this section. Continue anyway?`
          : `This subject already has a teacher assigned (${conflictRow.staff.name_en}) for one or more sections -- adding a whole-class teacher would mean two teachers are both assigned there. Continue anyway?`;
        return res.status(400).json({ success: false, error: { code: "SUBJECT_ASSIGNMENT_OVERLAP", message } });
      }
    }

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

    const existing = await prisma.subjectTeacherAssignment.findUnique({ where: { id } });
    if (!existing) throw notFound("Assignment not found");
    const oldStaffId = existing.staff_id;

    const assignment = await prisma.subjectTeacherAssignment.update({ where: { id }, data: body });

    // Routine auto-sync prompt data (Plan Twenty-Seven, item 4) -- the
    // Routine never auto-updates on its own (deliberate, confirmed default
    // behavior), but count how many RoutineSlot rows the OLD teacher held
    // for this exact subject(+section) so the frontend can offer a one-click
    // "update the routine too?" prompt instead of leaving the admin to
    // notice and fix it manually, slot by slot.
    const routineSlotsAffected = oldStaffId === body.staff_id
      ? 0
      : await prisma.routineSlot.count({
          where: { subject_id: existing.subject_id, teacher_id: oldStaffId, ...(existing.section_id ? { section_id: existing.section_id } : {}) },
        });

    res.json({ success: true, data: { ...assignment, old_staff_id: oldStaffId, routine_slots_affected: routineSlotsAffected } });
  }),
);

// Explicit, separate, opt-in confirm step (Plan Twenty-Seven, item 4) --
// the routine only ever updates when the admin clicks "Yes" on the prompt
// PUT /assign/:id's response makes possible; never auto-applied. Any
// matching slot where the new teacher would clash with their own existing
// schedule is skipped and reported, not silently double-booked.
subjectsRouter.post(
  "/assign/:id/sync-routine",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = z.object({ old_staff_id: z.string().min(1) }).parse(req.body);

    const assignment = await prisma.subjectTeacherAssignment.findUnique({ where: { id } });
    if (!assignment) throw notFound("Assignment not found");

    const slots = await prisma.routineSlot.findMany({
      where: { subject_id: assignment.subject_id, teacher_id: body.old_staff_id, ...(assignment.section_id ? { section_id: assignment.section_id } : {}) },
    });

    let updated = 0;
    const skipped: { routine_slot_id: string; reason: string }[] = [];
    for (const slot of slots) {
      try {
        await assertNoTeacherClash({ teacher_id: assignment.staff_id, day_of_week: slot.day_of_week, period_no: slot.period_no }, slot.id);
        await prisma.routineSlot.update({ where: { id: slot.id }, data: { teacher_id: assignment.staff_id } });
        updated++;
      } catch (err) {
        skipped.push({ routine_slot_id: slot.id, reason: err instanceof Error ? err.message : "Could not update this slot" });
      }
    }

    res.json({ success: true, data: { updated, skipped } });
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
