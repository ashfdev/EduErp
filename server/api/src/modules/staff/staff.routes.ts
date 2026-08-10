import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { TEACHING_ROLES, STAFF_ONLY_ROLES } from "../../lib/roles";

export const staffRouter = Router();
staffRouter.use(authenticate);

// Minimal read-only endpoint — full HR/staff CRUD lands in Phase 12.
// department_id/subject_id are optional narrowing filters for the
// substitute-teacher picker (Plan Fourteen, Phase C1) — subject_id already
// correctly handles group-scoping "for free" since a group-scoped Subject
// row is distinct per Group, so a teacher's SubjectTeacherAssignment for
// that exact subject_id already implies the right group.
staffRouter.get(
  "/teachers",
  asyncHandler(async (req, res) => {
    const query = z.object({ department_id: z.string().optional(), subject_id: z.string().optional() }).parse(req.query);
    const teachers = await prisma.staff.findMany({
      where: {
        is_active: true,
        deleted_at: null,
        user: { role: { in: TEACHING_ROLES } },
        ...(query.department_id && { department_id: query.department_id }),
        ...(query.subject_id && { subject_assignments: { some: { subject_id: query.subject_id } } }),
      },
      select: { id: true, name_en: true, designation: true, department_id: true, user: { select: { role: true } } },
      orderBy: { name_en: "asc" },
    });
    res.json({ success: true, data: teachers });
  }),
);

// Teacher assignment overview (2026-08-09, redesigned same day per direct
// owner feedback — the first version listed each teacher's overall subject/
// class assignments as a flat, unfiltered card list; what's actually wanted
// is a real table, filterable by day/class/room, showing each teacher's
// REAL day-specific schedule (period-by-period, from RoutineSlot — the
// actual timetable, not just "which subjects are they assigned to overall")
// all together in one row. day_of_week defaults to today; class_id/room_id
// narrow to teachers who actually have a matching period that day, matching
// "find who's teaching Class 9 today" / "who's using the Science Lab
// today" as real, distinct lookups, not just cosmetic filters.
staffRouter.get(
  "/assignments-overview",
  authorize(STAFF_ONLY_ROLES),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        search: z.string().optional(),
        department_id: z.string().optional(),
        day_of_week: z.coerce.number().int().min(0).max(6).optional(),
        class_id: z.string().optional(),
        room_id: z.string().optional(),
      })
      .parse(req.query);

    const dayOfWeek = query.day_of_week ?? new Date().getDay();

    const teachers = await prisma.staff.findMany({
      where: {
        is_active: true,
        deleted_at: null,
        user: { role: { in: TEACHING_ROLES } },
        ...(query.department_id && { department_id: query.department_id }),
        ...(query.search && {
          OR: [
            { name_en: { contains: query.search, mode: "insensitive" } },
            { staff_uid: { contains: query.search, mode: "insensitive" } },
            { phone: { contains: query.search, mode: "insensitive" } },
          ],
        }),
      },
      select: { id: true, name_en: true, staff_uid: true, phone: true, designation: true, user: { select: { role: true } } },
      orderBy: { name_en: "asc" },
    });
    const teacherIds = teachers.map((t) => t.id);

    const slots = await prisma.routineSlot.findMany({
      where: {
        teacher_id: { in: teacherIds },
        day_of_week: dayOfWeek,
        ...(query.class_id && { class_id: query.class_id }),
        ...(query.room_id && { room_id: query.room_id }),
      },
      select: {
        teacher_id: true,
        period_no: true,
        class: { select: { name_en: true } },
        section: { select: { name: true } },
        subject: { select: { name_en: true } },
        room: { select: { name: true } },
      },
      orderBy: { period_no: "asc" },
    });

    const slotsByTeacher = new Map<string, typeof slots>();
    for (const slot of slots) {
      if (!slot.teacher_id) continue;
      const list = slotsByTeacher.get(slot.teacher_id) ?? [];
      list.push(slot);
      slotsByTeacher.set(slot.teacher_id, list);
    }

    // When narrowing by class/room, only show teachers who actually have a
    // matching period that day — otherwise every teacher stays listed
    // (including ones with zero classes that day, useful to spot idle
    // teachers) since day_of_week alone isn't meant to hide anyone.
    const narrowing = Boolean(query.class_id || query.room_id);

    const data = teachers
      .map((t) => ({
        staff_id: t.id,
        name_en: t.name_en,
        staff_uid: t.staff_uid,
        phone: t.phone,
        designation: t.designation,
        role: t.user.role,
        todays_classes: (slotsByTeacher.get(t.id) ?? []).map((s) => ({
          period_no: s.period_no,
          class_name: s.class.name_en,
          section_name: s.section?.name ?? "Whole Class",
          subject_name: s.subject?.name_en ?? null,
          room_name: s.room?.name ?? null,
        })),
      }))
      .filter((t) => !narrowing || t.todays_classes.length > 0);

    res.json({ success: true, data: { day_of_week: dayOfWeek, teachers: data } });
  }),
);
