import { Router } from "express";
import { reqParam } from "../../lib/req-param";
import { z } from "zod";
import type { Prisma } from "@education-erp/db";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { SETTINGS_ACADEMIC_ROLES } from "../../lib/roles";
import {
  academicYearSchema,
  shiftSchema,
  shiftPeriodSchema,
  departmentSchema,
  classSchema,
  sectionSchema,
  routineSlotSchema,
  generateRoutineSchema,
} from "@education-erp/validators";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { logAudit } from "../../lib/audit-log";

export const academicYearsRouter = Router();
export const shiftsRouter = Router();
export const departmentsRouter = Router();
export const classesRouter = Router();
export const sectionsRouter = Router();
export const routineRouter = Router();

for (const r of [academicYearsRouter, shiftsRouter, departmentsRouter, classesRouter, sectionsRouter, routineRouter]) {
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

// ── Shift Periods ────────────────────────────────────────────────
// Period-by-period breakdown of a shift (start/end time per period, which
// ones are breaks) — Shift itself only ever carried an overall start/end
// time. The routine auto-generator (below) is the first consumer.

shiftsRouter.get(
  "/:shift_id/periods",
  asyncHandler(async (req, res) => {
    const periods = await prisma.shiftPeriod.findMany({
      where: { shift_id: reqParam(req, "shift_id") },
      orderBy: { period_no: "asc" },
    });
    res.json({ success: true, data: periods });
  }),
);

shiftsRouter.post(
  "/:shift_id/periods",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const shift_id = reqParam(req, "shift_id");
    const body = shiftPeriodSchema.parse(req.body);
    const existing = await prisma.shiftPeriod.findUnique({
      where: { shift_id_period_no: { shift_id, period_no: body.period_no } },
    });
    if (existing) throw conflict(`Period ${body.period_no} already exists for this shift`);
    const period = await prisma.shiftPeriod.create({ data: { ...body, shift_id } });
    res.status(201).json({ success: true, data: period });
  }),
);

shiftsRouter.put(
  "/:shift_id/periods/:period_id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = shiftPeriodSchema.partial().parse(req.body);
    const period = await prisma.shiftPeriod.update({ where: { id: reqParam(req, "period_id") }, data: body });
    res.json({ success: true, data: period });
  }),
);

shiftsRouter.delete(
  "/:shift_id/periods/:period_id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.shiftPeriod.delete({ where: { id: reqParam(req, "period_id") } });
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
        sections: { include: { shift: { select: { id: true, name: true, start_time: true, end_time: true } }, _count: { select: { students: true } } } },
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

// ── Routine / Timetable ──────────────────────────────────────────
// RoutineSlot existed in the schema since Phase 15 purely to back the
// student portal's read-only "my routine" view — nothing ever wrote to it.
// This is the first create/edit path.

// A teacher physically cannot teach two different slots at the same
// day/period, regardless of class/section — so any other RoutineSlot row
// for the same teacher at this exact day_of_week+period_no is a clash.
export async function assertNoTeacherClash(input: { teacher_id?: string | null; day_of_week: number; period_no: number }, excludeId?: string) {
  if (!input.teacher_id) return;
  const clash = await prisma.routineSlot.findFirst({
    where: {
      id: excludeId ? { not: excludeId } : undefined,
      teacher_id: input.teacher_id,
      day_of_week: input.day_of_week,
      period_no: input.period_no,
    },
    include: { class: { select: { name_en: true } }, section: { select: { name: true } } },
  });
  if (clash) {
    throw badRequest(
      `This teacher is already booked for period ${input.period_no} on this day, in ${clash.class.name_en}${clash.section ? ` (${clash.section.name})` : ""}`,
    );
  }
}

routineRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z.object({ class_id: z.string().optional(), section_id: z.string().optional() }).parse(req.query);
    const slots = await prisma.routineSlot.findMany({
      where: {
        ...(query.class_id && { class_id: query.class_id }),
        ...(query.section_id && { section_id: query.section_id }),
      },
      include: { subject: { select: { name_en: true } }, teacher: { select: { name_en: true } } },
      orderBy: [{ day_of_week: "asc" }, { period_no: "asc" }],
    });
    res.json({ success: true, data: slots });
  }),
);

routineRouter.post(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = routineSlotSchema.parse(req.body);
    await assertNoTeacherClash(body);
    const slot = await prisma.routineSlot.create({ data: body });
    res.status(201).json({ success: true, data: slot });
  }),
);

routineRouter.put(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = routineSlotSchema.partial().parse(req.body);
    const existing = await prisma.routineSlot.findUnique({ where: { id } });
    if (!existing) throw badRequest("Routine slot not found");
    const merged = { ...existing, ...body };
    await assertNoTeacherClash(merged, id);
    const slot = await prisma.routineSlot.update({ where: { id }, data: body });
    res.json({ success: true, data: slot });
  }),
);

routineRouter.delete(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.routineSlot.delete({ where: { id: reqParam(req, "id") } });
    res.status(204).send();
  }),
);

// ── Auto-generate routine ───────────────────────────────────────
// Bangladesh default: Sat-Thu working, Friday off. Only used when
// AttendanceRules.working_days hasn't been explicitly configured.
const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4, 6];
// Traversal order for round-robin day spreading — Saturday first, matching
// the BD week, so a subject's periods land on visibly different days
// instead of clustering on day 1.
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

export function orderedWorkingDays(days: number[]): number[] {
  return [...days].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));
}

export function rotate<T>(arr: T[], offset: number): T[] {
  if (arr.length === 0) return arr;
  const i = offset % arr.length;
  return [...arr.slice(i), ...arr.slice(0, i)];
}

export interface GeneratedPlacement {
  section_id: string;
  day_of_week: number;
  period_no: number;
  start_time: string;
  end_time: string;
  subject_id: string;
  teacher_id: string;
}
export interface UnplacedItem {
  section_id: string;
  section_name: string;
  subject_id: string;
  subject_name: string;
  reason: string;
}

export async function generateClassRoutine(tx: Prisma.TransactionClient, classId: string, workingDays: number[]) {
  const klass = await tx.class.findUnique({
    where: { id: classId },
    include: {
      sections: {
        where: { is_active: true },
        include: { shift: { include: { periods: { where: { is_break: false }, orderBy: { period_no: "asc" } } } } },
      },
      subjects: { where: { is_compulsory: true, is_active: true }, orderBy: { display_order: "asc" } },
    },
  });
  if (!klass) throw notFound("Class not found");

  // Wipe only previously auto-generated rows for this class — hand-edited
  // slots (generated: false) are never touched by a regenerate.
  await tx.routineSlot.deleteMany({ where: { class_id: classId, generated: true } });

  const placements: GeneratedPlacement[] = [];
  const unplaced: UnplacedItem[] = [];
  const days = orderedWorkingDays(workingDays);

  for (const section of klass.sections) {
    const periods = section.shift?.periods ?? [];
    if (periods.length === 0) {
      for (const subject of klass.subjects) {
        unplaced.push({
          section_id: section.id,
          section_name: section.name,
          subject_id: subject.id,
          subject_name: subject.name_en,
          reason: "Section's shift has no periods configured",
        });
      }
      continue;
    }
    if (klass.subjects.length === 0) continue;

    // Resolve a teacher per compulsory subject: section-specific
    // SubjectTeacherAssignment first, falling back to a class-wide one
    // (section_id: null).
    const assignmentBySubject = new Map<string, string>();
    for (const subject of klass.subjects) {
      const assignment =
        (await tx.subjectTeacherAssignment.findFirst({
          where: { subject_id: subject.id, section_id: section.id, academic_year_id: klass.academic_year_id },
        })) ??
        (await tx.subjectTeacherAssignment.findFirst({
          where: { subject_id: subject.id, section_id: null, academic_year_id: klass.academic_year_id },
        }));
      if (assignment) assignmentBySubject.set(subject.id, assignment.staff_id);
      else {
        unplaced.push({
          section_id: section.id,
          section_name: section.name,
          subject_id: subject.id,
          subject_name: subject.name_en,
          reason: "No teacher assigned for this subject/section",
        });
      }
    }

    const subjectsWithTeacher = klass.subjects.filter((s) => assignmentBySubject.has(s.id));
    if (subjectsWithTeacher.length === 0) continue;

    // Existing manual slots for this class/section (auto-generated ones were
    // just wiped above) — these occupy real slots the generator must avoid.
    const existingSectionSlots = await tx.routineSlot.findMany({
      where: { class_id: classId, section_id: section.id },
      select: { day_of_week: true, period_no: true },
    });
    const occupied = new Set(existingSectionSlots.map((s) => `${s.day_of_week}-${s.period_no}`));

    const teacherIds = [...new Set(subjectsWithTeacher.map((s) => assignmentBySubject.get(s.id)!))];
    const existingTeacherSlots = await tx.routineSlot.findMany({
      where: { teacher_id: { in: teacherIds } },
      select: { teacher_id: true, day_of_week: true, period_no: true },
    });
    const teacherOccupied = new Map<string, Set<string>>();
    for (const t of teacherIds) teacherOccupied.set(t, new Set());
    for (const s of existingTeacherSlots) {
      teacherOccupied.get(s.teacher_id!)?.add(`${s.day_of_week}-${s.period_no}`);
    }
    // Also mark slots this same generation run already placed for OTHER
    // sections of this class — not yet committed, so a fresh DB read
    // wouldn't see them.
    for (const p of placements) {
      if (!teacherOccupied.has(p.teacher_id)) teacherOccupied.set(p.teacher_id, new Set());
      teacherOccupied.get(p.teacher_id)!.add(`${p.day_of_week}-${p.period_no}`);
    }

    const totalSlots = days.length * periods.length;
    const baseCount = Math.floor(totalSlots / subjectsWithTeacher.length);
    const remainder = totalSlots % subjectsWithTeacher.length;

    const queue = subjectsWithTeacher.map((subject, i) => ({
      subject,
      teacherId: assignmentBySubject.get(subject.id)!,
      remaining: baseCount + (i < remainder ? 1 : 0),
      usedDays: new Set<number>(),
      dayOffset: i % days.length,
    }));

    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const item of queue) {
        if (item.remaining <= 0) continue;
        progressed = true;
        const teacherSet = teacherOccupied.get(item.teacherId)!;
        const dayCandidatesFresh = rotate(days, item.dayOffset).filter((d) => !item.usedDays.has(d));
        const dayCandidatesAll = rotate(days, item.dayOffset);
        let placedHere = false;
        for (const dayList of [dayCandidatesFresh, dayCandidatesAll]) {
          for (const day of dayList) {
            for (const period of periods) {
              const slotKey = `${day}-${period.period_no}`;
              if (occupied.has(slotKey) || teacherSet.has(slotKey)) continue;
              occupied.add(slotKey);
              teacherSet.add(slotKey);
              item.usedDays.add(day);
              placements.push({
                section_id: section.id,
                day_of_week: day,
                period_no: period.period_no,
                start_time: period.start_time,
                end_time: period.end_time,
                subject_id: item.subject.id,
                teacher_id: item.teacherId,
              });
              item.remaining--;
              placedHere = true;
              break;
            }
            if (placedHere) break;
          }
          if (placedHere) break;
        }
        if (!placedHere) {
          unplaced.push({
            section_id: section.id,
            section_name: section.name,
            subject_id: item.subject.id,
            subject_name: item.subject.name_en,
            reason: "Could not schedule without double-booking the assigned teacher",
          });
          item.remaining = 0;
        }
      }
    }
  }

  if (placements.length > 0) {
    await tx.routineSlot.createMany({
      data: placements.map((p) => ({
        class_id: classId,
        section_id: p.section_id,
        day_of_week: p.day_of_week,
        period_no: p.period_no,
        subject_id: p.subject_id,
        teacher_id: p.teacher_id,
        start_time: p.start_time,
        end_time: p.end_time,
        generated: true,
      })),
    });
  }

  return { class_id: classId, class_name: klass.name_en, placed_count: placements.length, unplaced };
}

routineRouter.post(
  "/generate",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = generateRoutineSchema.parse(req.body);
    const rules = await prisma.attendanceRules.findUnique({ where: { id: "singleton" } });
    const workingDays = (rules?.working_days as number[] | null) ?? DEFAULT_WORKING_DAYS;

    const classIds =
      body.scope === "CLASS"
        ? [body.class_id!]
        : (await prisma.class.findMany({ where: { is_active: true }, select: { id: true } })).map((c) => c.id);

    if (classIds.length === 0) throw badRequest("No classes to generate a routine for");

    const results: Array<{ class_id: string; class_name: string; placed_count: number; unplaced: UnplacedItem[] }> = [];
    const failures: Array<{ class_id: string; error: string }> = [];

    // Each class gets its own transaction — a bug/collision in one class
    // must not roll back classes that were successfully generated earlier
    // in the same campus-wide run, and classes are processed sequentially
    // so each transaction's committed writes are visible to teacher-clash
    // checks in the next class.
    for (const classId of classIds) {
      try {
        const result = await prisma.$transaction((tx) => generateClassRoutine(tx, classId, workingDays));
        results.push(result);
      } catch (err) {
        failures.push({ class_id: classId, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    await logAudit("ROUTINE_GENERATE", {
      userId: req.user!.sub,
      targetType: "RoutineSlot",
      targetId: body.scope === "CLASS" ? body.class_id! : "CAMPUS",
      metadata: { scope: body.scope, class_count: classIds.length, placed: results.reduce((sum, r) => sum + r.placed_count, 0), failed: failures.length },
      req,
    });

    res.json({ success: true, data: { results, failures } });
  }),
);
