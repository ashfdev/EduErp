import { Router } from "express";
import { randomUUID } from "node:crypto";
import { reqParam } from "../../lib/req-param";
import { z } from "zod";
import { Prisma } from "@education-erp/db";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { SETTINGS_ACADEMIC_ROLES, STAFF_ONLY_ROLES } from "../../lib/roles";
import {
  academicYearSchema,
  shiftSchema,
  shiftPeriodSchema,
  roomSchema,
  departmentSchema,
  classSchema,
  sectionSchema,
  groupSchema,
  routineSlotSchema,
  routineDoubleSlotSchema,
  routineSubstitutionSchema,
  generateRoutineSchema,
} from "@education-erp/validators";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { logAudit } from "../../lib/audit-log";
import { createInAppNotification } from "../../services/in-app-notification.service";

export const academicYearsRouter = Router();
export const shiftsRouter = Router();
export const roomsRouter = Router();
export const departmentsRouter = Router();
export const classesRouter = Router();
export const sectionsRouter = Router();
export const groupsRouter = Router();
export const routineRouter = Router();

for (const r of [academicYearsRouter, shiftsRouter, roomsRouter, departmentsRouter, classesRouter, sectionsRouter, groupsRouter, routineRouter]) {
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

// ── Rooms (Plan Twenty-Five, Phase C3) ──────────────────────────
// Genuinely new — no room/lab concept existed before. is_lab drives the
// routine auto-generator's room selection for a Subject flagged
// requires_lab; a plain (non-lab) room is still assignable manually to any
// slot. Delete is a hard delete (mirrors Shift's own delete above) — a
// deleted room simply nulls out room_id on any RoutineSlot referencing it
// (onDelete: SetNull), never blocks the delete.

roomsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rooms = await prisma.room.findMany({ orderBy: { name: "asc" } });
    res.json({ success: true, data: rooms });
  }),
);

roomsRouter.post(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = roomSchema.parse(req.body);
    const room = await prisma.room.create({ data: body });
    res.status(201).json({ success: true, data: room });
  }),
);

roomsRouter.put(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = roomSchema.partial().parse(req.body);
    const room = await prisma.room.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: room });
  }),
);

roomsRouter.delete(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.room.delete({ where: { id: reqParam(req, "id") } });
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
        sections: {
          include: {
            shift: { select: { id: true, name: true, start_time: true, end_time: true } },
            class_teacher: { select: { id: true, name_en: true } },
            _count: { select: { students: true } },
          },
        },
        groups: { where: { is_active: true }, orderBy: { display_order: "asc" }, include: { _count: { select: { students: true } } } },
        academic_year: { select: { label: true } },
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

// ── Groups / Streams (Science/Commerce/Arts) ──────────────────────
// Per-class-scoped — see the Group model's own schema comment for why.

classesRouter.post(
  "/:class_id/groups",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = groupSchema.parse(req.body);
    const existing = await prisma.group.findUnique({
      where: { class_id_code: { class_id: reqParam(req, "class_id"), code: body.code } },
    });
    if (existing) throw conflict("A group with this code already exists in this class");
    const group = await prisma.group.create({ data: { ...body, class_id: reqParam(req, "class_id") } });
    res.status(201).json({ success: true, data: group });
  }),
);

groupsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z.object({ class_id: z.string().optional() }).parse(req.query);
    const groups = await prisma.group.findMany({
      where: { is_active: true, ...(query.class_id && { class_id: query.class_id }) },
      orderBy: { display_order: "asc" },
    });
    res.json({ success: true, data: groups });
  }),
);

groupsRouter.put(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = groupSchema.partial().parse(req.body);
    const group = await prisma.group.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: group });
  }),
);

groupsRouter.delete(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const hasStudents = await prisma.student.findFirst({ where: { group_id: id } });
    if (hasStudents) throw conflict("This group has students assigned and cannot be deleted");
    await prisma.group.update({ where: { id }, data: { is_active: false } });
    res.status(204).send();
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

// A room can't host two different classes at the same day/period either
// (Plan Twenty-Five, Phase C3) — same shape as assertNoTeacherClash above,
// backstopped by the same DB-level partial unique index for the race case.
export async function assertNoRoomClash(input: { room_id?: string | null; day_of_week: number; period_no: number }, excludeId?: string) {
  if (!input.room_id) return;
  const clash = await prisma.routineSlot.findFirst({
    where: {
      id: excludeId ? { not: excludeId } : undefined,
      room_id: input.room_id,
      day_of_week: input.day_of_week,
      period_no: input.period_no,
    },
    include: { class: { select: { name_en: true } }, section: { select: { name: true } }, room: { select: { name: true } } },
  });
  if (clash) {
    throw badRequest(
      `${clash.room?.name ?? "This room"} is already booked for period ${input.period_no} on this day, by ${clash.class.name_en}${clash.section ? ` (${clash.section.name})` : ""}`,
    );
  }
}

routineRouter.get(
  "/",
  // Real gap found in audit (2026-08-08): no authorize() at all, so any
  // portal (STUDENT/GUARDIAN) token could pull the campus-wide teacher/
  // room/subject timetable directly -- unlike most other read-only
  // Settings-reference routes in this file (grading scales, etc.), which
  // are deliberately open to any authenticated staff-or-portal account
  // since they're low-sensitivity reference data. Routine data is
  // different: it reveals which teacher is where, when, campus-wide, and
  // the portal already has its own properly section-scoped routine
  // endpoint (portal.routes.ts) -- this raw admin route has no legitimate
  // portal use case. Gated to staff-only.
  authorize(STAFF_ONLY_ROLES),
  asyncHandler(async (req, res) => {
    const query = z
      .object({ class_id: z.string().optional(), section_id: z.string().optional(), group_id: z.string().optional(), day_of_week: z.coerce.number().int().min(0).max(6).optional() })
      .parse(req.query);
    const slots = await prisma.routineSlot.findMany({
      where: {
        ...(query.class_id && { class_id: query.class_id }),
        ...(query.section_id && { section_id: query.section_id }),
        // Plan Thirteen, Phase K — lets the Proxy/Substitute admin page ask
        // "every slot happening on this specific weekday, across every
        // class" without needing a class_id first.
        ...(query.day_of_week !== undefined && { day_of_week: query.day_of_week }),
        // Omitted entirely = every slot (shared + every group), matching the
        // admin "no group filter selected" view. Explicitly passed = that
        // group's own slots PLUS the shared (group_id: null) ones every
        // group attends — never just an exact-match-only filter, since a
        // shared subject is part of every group's real schedule too.
        ...(query.group_id && { OR: [{ group_id: query.group_id }, { group_id: null }] }),
      },
      include: {
        class: { select: { id: true, name_en: true } },
        section: { select: { name: true } },
        // id added (Plan Fourteen, Phase C1) — the Proxy/Substitute page
        // uses it to pre-fill the substitute picker's Subject filter.
        subject: { select: { id: true, name_en: true } },
        teacher: { select: { id: true, name_en: true } },
        group: { select: { name_en: true } },
        room: { select: { id: true, name: true, is_lab: true } },
      },
      orderBy: [{ day_of_week: "asc" }, { period_no: "asc" }],
    });
    res.json({ success: true, data: slots });
  }),
);

const ROUTINE_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Translates the raw Prisma P2002 unique-constraint violation on RoutineSlot
// (class_id+section_id+group_id+day_of_week+period_no, or the teacher/day/
// period constraint) into a real sentence, matching assertNoTeacherClash's
// message quality — previously this bubbled up as the generic error
// handler's "A record with this class_id, section_id... already exists",
// which is almost certainly the literal "not possible" confusion this phase
// exists to fix. Re-throws anything else unchanged.
function mapRoutineSlotConflict(err: unknown, day_of_week: number, period_no: number): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const dayName = ROUTINE_DAY_NAMES[day_of_week] ?? `day ${day_of_week}`;
    throw conflict(`This section already has a class scheduled for period ${period_no} on ${dayName}. Edit or remove the existing slot first.`);
  }
  throw err;
}

routineRouter.post(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = routineSlotSchema.parse(req.body);
    await assertNoTeacherClash(body);
    await assertNoRoomClash(body);
    try {
      const slot = await prisma.routineSlot.create({ data: body });
      res.status(201).json({ success: true, data: slot });
    } catch (err) {
      mapRoutineSlotConflict(err, body.day_of_week, body.period_no);
    }
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
    // Only re-validate the teacher/day/period combo when the edit actually
    // touches one of those three fields — an edit that only changes, say,
    // subject_id must never fail because of an unrelated collision that
    // developed since this slot was originally created (a real, confirmed
    // bug: re-validating the merged-but-unchanged combo on every edit).
    const touchesClashFields = body.teacher_id !== undefined || body.day_of_week !== undefined || body.period_no !== undefined;
    if (touchesClashFields) await assertNoTeacherClash(merged, id);
    // Same "only re-validate when relevant fields actually changed" guard,
    // for the room constraint.
    const touchesRoomFields = body.room_id !== undefined || body.day_of_week !== undefined || body.period_no !== undefined;
    if (touchesRoomFields) await assertNoRoomClash(merged, id);
    try {
      const slot = await prisma.routineSlot.update({ where: { id }, data: body });
      res.json({ success: true, data: slot });
    } catch (err) {
      mapRoutineSlotConflict(err, merged.day_of_week, merged.period_no);
    }
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

// Manual double-period creation (Plan Twenty-Five, Phase C4) — creates both
// consecutive-period rows in one request, linked via pair_id, checking
// teacher/room clashes for BOTH periods before creating either (a single
// transaction, so a clash on the second period never leaves the first one
// half-created).
routineRouter.post(
  "/double",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = routineDoubleSlotSchema.parse(req.body);
    if (body.second_period_no !== body.period_no + 1) {
      throw badRequest("The second period must be the very next period on the same day");
    }
    const firstInput = { teacher_id: body.teacher_id, room_id: body.room_id, day_of_week: body.day_of_week, period_no: body.period_no };
    const secondInput = { teacher_id: body.teacher_id, room_id: body.room_id, day_of_week: body.day_of_week, period_no: body.second_period_no };
    await assertNoTeacherClash(firstInput);
    await assertNoTeacherClash(secondInput);
    await assertNoRoomClash(firstInput);
    await assertNoRoomClash(secondInput);

    try {
      const [first, second] = await prisma.$transaction([
        prisma.routineSlot.create({
          data: {
            class_id: body.class_id,
            section_id: body.section_id,
            day_of_week: body.day_of_week,
            period_no: body.period_no,
            subject_id: body.subject_id,
            teacher_id: body.teacher_id,
            group_id: body.group_id,
            room_id: body.room_id,
            start_time: body.start_time,
            end_time: body.end_time,
          },
        }),
        prisma.routineSlot.create({
          data: {
            class_id: body.class_id,
            section_id: body.section_id,
            day_of_week: body.day_of_week,
            period_no: body.second_period_no,
            subject_id: body.subject_id,
            teacher_id: body.teacher_id,
            group_id: body.group_id,
            room_id: body.room_id,
            start_time: body.second_start_time,
            end_time: body.second_end_time,
          },
        }),
      ]);
      await prisma.routineSlot.update({ where: { id: second.id }, data: { pair_id: first.id } });
      res.status(201).json({ success: true, data: [first, { ...second, pair_id: first.id }] });
    } catch (err) {
      mapRoutineSlotConflict(err, body.day_of_week, body.period_no);
    }
  }),
);

// ── Teacher Proxy / Substitute Management (Plan Thirteen, Phase K) ──────
// A date-specific exception recorded against a recurring RoutineSlot,
// mirroring AdmitCardOverride's own separate-override-table shape — the
// base RoutineSlot row is never mutated, this only records "on this one
// date, this other teacher covers this slot instead."

// A candidate substitute must be free at that exact (day_of_week, period_no)
// on the given date — checked two ways: not already teaching a *different*
// RoutineSlot at that day/period (their own regular schedule), and not
// already covering as a substitute for some *other* slot at that date/
// period. Both checks are real double-booking risks; neither alone is
// sufficient.
async function assertSubstituteAvailable(input: { substituteTeacherId: string; dayOfWeek: number; periodNo: number; date: Date; excludeRoutineSlotId: string }) {
  const ownSlotClash = await prisma.routineSlot.findFirst({
    where: {
      teacher_id: input.substituteTeacherId,
      day_of_week: input.dayOfWeek,
      period_no: input.periodNo,
      id: { not: input.excludeRoutineSlotId },
    },
    include: { class: { select: { name_en: true } }, section: { select: { name: true } } },
  });
  if (ownSlotClash) {
    throw badRequest(
      `This teacher already teaches period ${input.periodNo} on this day, in ${ownSlotClash.class.name_en}${ownSlotClash.section ? ` (${ownSlotClash.section.name})` : ""}`,
    );
  }

  const substitutionClash = await prisma.routineSubstitution.findFirst({
    where: {
      substitute_teacher_id: input.substituteTeacherId,
      date: input.date,
      routine_slot: { period_no: input.periodNo },
      routine_slot_id: { not: input.excludeRoutineSlotId },
    },
  });
  if (substitutionClash) {
    throw badRequest("This teacher is already covering another class at this same period on this date");
  }
}

export const routineSubstitutionsRouter = Router();
routineSubstitutionsRouter.use(authenticate);

routineSubstitutionsRouter.get(
  "/",
  // Same real gap and same fix as routineRouter's own GET / above.
  authorize(STAFF_ONLY_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ date: z.coerce.date() }).parse(req.query);
    const date = new Date(Date.UTC(query.date.getFullYear(), query.date.getMonth(), query.date.getDate()));
    const substitutions = await prisma.routineSubstitution.findMany({
      where: { date },
      include: {
        routine_slot: {
          include: {
            class: { select: { name_en: true } },
            section: { select: { name: true } },
            subject: { select: { name_en: true } },
          },
        },
        original_teacher: { select: { name_en: true } },
        substitute_teacher: { select: { name_en: true } },
      },
      orderBy: { routine_slot: { period_no: "asc" } },
    });
    res.json({ success: true, data: substitutions });
  }),
);

routineSubstitutionsRouter.post(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = routineSubstitutionSchema.parse(req.body);
    const slot = await prisma.routineSlot.findUnique({ where: { id: body.routine_slot_id } });
    if (!slot) throw notFound("Routine slot not found");
    if (!slot.teacher_id) throw badRequest("This routine slot has no regular teacher assigned yet");

    const date = new Date(Date.UTC(body.date.getFullYear(), body.date.getMonth(), body.date.getDate()));
    if (date.getUTCDay() !== slot.day_of_week) {
      throw badRequest("The given date's weekday doesn't match this routine slot's scheduled day");
    }
    if (body.substitute_teacher_id === slot.teacher_id) {
      throw badRequest("The substitute cannot be the same as the regular teacher");
    }

    await assertSubstituteAvailable({
      substituteTeacherId: body.substitute_teacher_id,
      dayOfWeek: slot.day_of_week,
      periodNo: slot.period_no,
      date,
      excludeRoutineSlotId: slot.id,
    });

    const existing = await prisma.routineSubstitution.findUnique({
      where: { routine_slot_id_date: { routine_slot_id: slot.id, date } },
    });
    if (existing) throw conflict("A substitute has already been assigned for this slot on this date");

    const substitution = await prisma.routineSubstitution.create({
      data: {
        routine_slot_id: slot.id,
        date,
        original_teacher_id: slot.teacher_id,
        substitute_teacher_id: body.substitute_teacher_id,
        reason: body.reason,
        assigned_by_id: req.user!.sub,
      },
    });

    const [substituteStaff, originalStaff] = await Promise.all([
      prisma.staff.findUnique({ where: { id: body.substitute_teacher_id }, select: { user_id: true, name_en: true } }),
      prisma.staff.findUnique({ where: { id: slot.teacher_id }, select: { user_id: true, name_en: true } }),
    ]);
    if (substituteStaff) {
      await createInAppNotification({
        userId: substituteStaff.user_id,
        type: "ROUTINE_UPDATED",
        title: "You've been assigned as a substitute teacher",
        body: `Cover period ${slot.period_no} on ${date.toISOString().slice(0, 10)}`,
        link: "/routine",
      });
    }
    // Notify the original (absent) teacher too, not just the substitute
    // (Plan Fourteen, Phase C2) — they were previously never told.
    if (originalStaff) {
      await createInAppNotification({
        userId: originalStaff.user_id,
        type: "ROUTINE_UPDATED",
        title: "A substitute has been arranged for your period",
        body: `Your period ${slot.period_no} on ${date.toISOString().slice(0, 10)} is being covered by ${substituteStaff?.name_en ?? "a substitute teacher"}`,
        link: "/routine",
      });
    }

    res.status(201).json({ success: true, data: substitution });
  }),
);

routineSubstitutionsRouter.delete(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.routineSubstitution.delete({ where: { id: reqParam(req, "id") } });
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
  group_id: string | null;
  room_id?: string | null;
  // Client-generated (randomUUID) only for the FIRST row of a double-period
  // pair, so the SECOND row's pair_id can reference it before either row
  // exists in the DB (createMany doesn't return generated ids) — undefined
  // for every ordinary single-period placement, which keeps Prisma's own
  // default cuid() generator.
  id?: string;
  pair_id?: string | null;
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

  // Rooms (Plan Twenty-Five, Phase C3) — shared campus-wide, not scoped to
  // this class/section, so fetched once. A requires_lab subject with zero
  // active lab rooms configured always fails to place — reported clearly
  // per-subject below rather than a generic placement failure.
  const labRooms = await tx.room.findMany({ where: { is_lab: true, is_active: true } });
  const anyLabSubjects = klass.subjects.some((s) => s.requires_lab);
  if (anyLabSubjects && labRooms.length === 0) {
    for (const subject of klass.subjects.filter((s) => s.requires_lab)) {
      for (const section of klass.sections) {
        unplaced.push({
          section_id: section.id,
          section_name: section.name,
          subject_id: subject.id,
          subject_name: subject.name_en,
          reason: "This subject needs a lab room, but no active lab rooms are configured (Settings → Rooms)",
        });
      }
    }
  }

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
    // Split by group_id: a shared (group_id: null) row blocks every group's
    // sub-loop below (the whole section attends it together), while a
    // Group-specific row only blocks placements for that same Group — a
    // different Group can legitimately use the same day/period (e.g. Science
    // sits Physics while Commerce sits Accounting in the same slot).
    const existingSectionSlots = await tx.routineSlot.findMany({
      where: { class_id: classId, section_id: section.id },
      select: { day_of_week: true, period_no: true, group_id: true },
    });
    const baseOccupied = new Set(
      existingSectionSlots.filter((s) => !s.group_id).map((s) => `${s.day_of_week}-${s.period_no}`),
    );
    const existingGroupOccupied = new Map<string, Set<string>>();
    for (const s of existingSectionSlots) {
      if (!s.group_id) continue;
      if (!existingGroupOccupied.has(s.group_id)) existingGroupOccupied.set(s.group_id, new Set());
      existingGroupOccupied.get(s.group_id)!.add(`${s.day_of_week}-${s.period_no}`);
    }

    // Teacher-clash tracking stays global across the shared queue and every
    // Group's queue below — one teacher can't be in two places at once
    // regardless of which Group a subject belongs to.
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

    // Optional per-teacher load caps (Staff.max_periods_per_day/week) — a
    // teacher without either set is treated exactly as before this feature
    // existed (no cap enforced). Daily counts are seeded from both already-
    // committed rows and this-run placements, same sources as teacherOccupied.
    const teacherCaps = new Map<string, { maxPerDay: number | null; maxPerWeek: number | null }>();
    if (teacherIds.length > 0) {
      const staffRows = await tx.staff.findMany({
        where: { id: { in: teacherIds } },
        select: { id: true, max_periods_per_day: true, max_periods_per_week: true },
      });
      for (const s of staffRows) teacherCaps.set(s.id, { maxPerDay: s.max_periods_per_day, maxPerWeek: s.max_periods_per_week });
    }
    const teacherDayCounts = new Map<string, Map<number, number>>();
    for (const t of teacherIds) teacherDayCounts.set(t, new Map());
    for (const s of existingTeacherSlots) {
      const dayMap = teacherDayCounts.get(s.teacher_id!);
      if (dayMap) dayMap.set(s.day_of_week, (dayMap.get(s.day_of_week) ?? 0) + 1);
    }
    for (const p of placements) {
      if (!teacherDayCounts.has(p.teacher_id)) teacherDayCounts.set(p.teacher_id, new Map());
      const dayMap = teacherDayCounts.get(p.teacher_id)!;
      dayMap.set(p.day_of_week, (dayMap.get(p.day_of_week) ?? 0) + 1);
    }

    // Room occupancy (Plan Twenty-Five, Phase C3) — a lab room is a shared
    // physical resource across the whole campus, so seeded from every
    // existing DB slot referencing one of these rooms (not scoped to this
    // class), plus this-run placements already made for OTHER sections.
    const roomOccupied = new Map<string, Set<string>>();
    for (const r of labRooms) roomOccupied.set(r.id, new Set());
    if (labRooms.length > 0) {
      const existingRoomSlots = await tx.routineSlot.findMany({
        where: { room_id: { in: labRooms.map((r) => r.id) } },
        select: { room_id: true, day_of_week: true, period_no: true },
      });
      for (const s of existingRoomSlots) roomOccupied.get(s.room_id!)?.add(`${s.day_of_week}-${s.period_no}`);
    }
    for (const p of placements) {
      if (p.room_id) roomOccupied.get(p.room_id)?.add(`${p.day_of_week}-${p.period_no}`);
    }
    // First free lab room at one (single-period) or two (double-period)
    // day/period keys — null if requires_lab but nothing's free for every
    // key requested, which the caller treats as "this combo doesn't work,
    // try the next one" rather than a hard failure.
    const findFreeLabRoom = (keys: string[]): string | null => {
      for (const room of labRooms) {
        const occ = roomOccupied.get(room.id)!;
        if (keys.every((k) => !occ.has(k))) return room.id;
      }
      return null;
    };

    const totalSlots = days.length * periods.length;

    // Places one subject list (either the shared/ungrouped queue, or one
    // Group's own queue) into the given occupied set, stamping groupId onto
    // every resulting placement. Identical placement logic to before this
    // phase — only now parameterized so it can run once for the shared
    // queue and again per Group, instead of once for the whole section.
    const runQueue = (subjectList: typeof subjectsWithTeacher, occupied: Set<string>, groupId: string | null) => {
      // Explicit per-subject weekly period counts (Subject.weekly_periods)
      // take priority; subjects with no explicit count fall back to an even
      // split of whatever's left, matching this generator's original
      // behavior exactly when no subject in the list has weekly_periods set.
      const explicitTotal = subjectList.reduce((sum, s) => sum + (s.weekly_periods ?? 0), 0);
      if (explicitTotal > totalSlots) {
        for (const subject of subjectList) {
          unplaced.push({
            section_id: section.id,
            section_name: section.name,
            subject_id: subject.id,
            subject_name: subject.name_en,
            reason: `Subjects with an explicit weekly period count need ${explicitTotal} periods/week, but this section only has ${totalSlots} available`,
          });
        }
        return;
      }
      const unsetSubjects = subjectList.filter((s) => !s.weekly_periods);
      const remainingSlots = totalSlots - explicitTotal;
      const baseCount = unsetSubjects.length > 0 ? Math.floor(remainingSlots / unsetSubjects.length) : 0;
      const remainder = unsetSubjects.length > 0 ? remainingSlots % unsetSubjects.length : 0;

      let unsetIndex = 0;
      const unorderedQueue = subjectList.map((subject) => {
        let count: number;
        if (subject.weekly_periods) {
          count = subject.weekly_periods;
        } else {
          count = baseCount + (unsetIndex < remainder ? 1 : 0);
          unsetIndex++;
        }
        return { subject, teacherId: assignmentBySubject.get(subject.id)!, remaining: count };
      });
      // Most-constrained-first: a subject needing more periods/week has
      // strictly less scheduling flexibility as the week fills up (fewer
      // remaining day/period combinations can still fit all of its
      // sessions), so it's placed before looser subjects that could have
      // used a different slot instead. Ties keep their original
      // display_order (JS sort is stable) — a real, bounded improvement
      // over pure insertion-order placement, without needing full
      // backtracking/constraint-solving. dayOffset is assigned AFTER
      // sorting so the day-rotation still spreads evenly across the
      // reordered queue, not the original insertion order.
      const sortedQueue = [...unorderedQueue].sort((a, b) => b.remaining - a.remaining);
      const queue = sortedQueue.map((entry, i) => ({ ...entry, usedDays: new Set<number>(), dayOffset: i % days.length }));

      let progressed = true;
      while (progressed) {
        progressed = false;
        for (const item of queue) {
          if (item.remaining <= 0) continue;
          progressed = true;
          const teacherSet = teacherOccupied.get(item.teacherId)!;
          const dayCounts = teacherDayCounts.get(item.teacherId)!;
          const cap = teacherCaps.get(item.teacherId);
          const dayCandidatesFresh = rotate(days, item.dayOffset).filter((d) => !item.usedDays.has(d));
          const dayCandidatesAll = rotate(days, item.dayOffset);
          let placedHere = false;
          const isDouble = item.subject.requires_double_period;
          for (const dayList of [dayCandidatesFresh, dayCandidatesAll]) {
            for (const day of dayList) {
              if (cap?.maxPerDay && (dayCounts.get(day) ?? 0) >= cap.maxPerDay) continue;
              if (cap?.maxPerWeek && teacherSet.size >= cap.maxPerWeek) continue;
              // A double-period placement needs room for 2, not 1, against
              // the same daily cap.
              if (isDouble && cap?.maxPerDay && (dayCounts.get(day) ?? 0) + 1 >= cap.maxPerDay) continue;

              for (let pi = 0; pi < periods.length; pi++) {
                const period = periods[pi]!;
                const slotKey = `${day}-${period.period_no}`;
                if (occupied.has(slotKey) || teacherSet.has(slotKey)) continue;

                if (isDouble) {
                  // Genuinely consecutive period NUMBERS on the same day, not
                  // just adjacent entries in the (break-filtered) periods
                  // array — e.g. period 2 then period 4 with period 3 being
                  // a break is NOT a valid double-period pair.
                  const nextPeriod = periods[pi + 1];
                  if (!nextPeriod || nextPeriod.period_no !== period.period_no + 1) continue;
                  const nextKey = `${day}-${nextPeriod.period_no}`;
                  if (occupied.has(nextKey) || teacherSet.has(nextKey)) continue;

                  const roomId = item.subject.requires_lab ? findFreeLabRoom([slotKey, nextKey]) : null;
                  if (item.subject.requires_lab && !roomId) continue;

                  occupied.add(slotKey);
                  occupied.add(nextKey);
                  teacherSet.add(slotKey);
                  teacherSet.add(nextKey);
                  if (roomId) {
                    roomOccupied.get(roomId)!.add(slotKey);
                    roomOccupied.get(roomId)!.add(nextKey);
                  }
                  dayCounts.set(day, (dayCounts.get(day) ?? 0) + 2);
                  item.usedDays.add(day);
                  const firstId = randomUUID();
                  placements.push({
                    id: firstId,
                    section_id: section.id,
                    day_of_week: day,
                    period_no: period.period_no,
                    start_time: period.start_time,
                    end_time: period.end_time,
                    subject_id: item.subject.id,
                    teacher_id: item.teacherId,
                    group_id: groupId,
                    room_id: roomId,
                  });
                  placements.push({
                    section_id: section.id,
                    day_of_week: day,
                    period_no: nextPeriod.period_no,
                    start_time: nextPeriod.start_time,
                    end_time: nextPeriod.end_time,
                    subject_id: item.subject.id,
                    teacher_id: item.teacherId,
                    group_id: groupId,
                    room_id: roomId,
                    pair_id: firstId,
                  });
                  item.remaining -= 2;
                  placedHere = true;
                  break;
                }

                const roomId = item.subject.requires_lab ? findFreeLabRoom([slotKey]) : null;
                if (item.subject.requires_lab && !roomId) continue;

                occupied.add(slotKey);
                teacherSet.add(slotKey);
                if (roomId) roomOccupied.get(roomId)!.add(slotKey);
                dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
                item.usedDays.add(day);
                placements.push({
                  section_id: section.id,
                  day_of_week: day,
                  period_no: period.period_no,
                  start_time: period.start_time,
                  end_time: period.end_time,
                  subject_id: item.subject.id,
                  teacher_id: item.teacherId,
                  group_id: groupId,
                  room_id: roomId,
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
              reason: "Could not schedule without double-booking the assigned teacher or exceeding their period-load cap",
            });
            item.remaining = 0;
          }
        }
      }
    };

    // Shared (group_id: null) subjects schedule once for the whole section,
    // exactly as every subject did before Group-awareness existed. For a
    // class with no Group-restricted subjects, sharedSubjects === every
    // subject with a resolved teacher, so this is the ONLY queue that runs —
    // byte-for-byte the same placement result as before this phase.
    const sharedSubjects = subjectsWithTeacher.filter((s) => !s.group_id);
    runQueue(sharedSubjects, baseOccupied, null);

    // Each Group gets its own independent sub-loop, seeded from the
    // now-updated baseOccupied (shared placements just made above) plus that
    // Group's own pre-existing rows — but NOT from any other Group's
    // occupied set, so different Groups can share the same day/period.
    const groupIds = [...new Set(subjectsWithTeacher.filter((s) => s.group_id).map((s) => s.group_id!))];
    for (const groupId of groupIds) {
      const groupOccupied = new Set([...baseOccupied, ...(existingGroupOccupied.get(groupId) ?? [])]);
      const subjectsForGroup = subjectsWithTeacher.filter((s) => s.group_id === groupId);
      runQueue(subjectsForGroup, groupOccupied, groupId);
    }
  }

  if (placements.length > 0) {
    await tx.routineSlot.createMany({
      data: placements.map((p) => ({
        // Only the first row of a double-period pair carries an explicit id
        // (see GeneratedPlacement.id's own comment) — undefined for every
        // other row, which keeps Prisma's default cuid() generator.
        ...(p.id ? { id: p.id } : {}),
        class_id: classId,
        section_id: p.section_id,
        day_of_week: p.day_of_week,
        period_no: p.period_no,
        subject_id: p.subject_id,
        teacher_id: p.teacher_id,
        group_id: p.group_id,
        room_id: p.room_id ?? null,
        pair_id: p.pair_id ?? null,
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

    const affectedSlots = await prisma.routineSlot.findMany({
      where: { class_id: { in: classIds }, generated: true },
      select: { teacher: { select: { user_id: true } } },
      distinct: ["teacher_id"],
    });
    await Promise.all(
      affectedSlots
        .filter((s): s is typeof s & { teacher: { user_id: string } } => !!s.teacher?.user_id)
        .map((s) => createInAppNotification({ userId: s.teacher.user_id, type: "ROUTINE_UPDATED", title: "Your class routine was updated", link: "/routine" })),
    );

    res.json({ success: true, data: { results, failures } });
  }),
);
