import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { TEACHER_APP_ROLES } from "../../lib/roles";

export const teacherRouter = Router();
teacherRouter.use(authenticate, authorize(TEACHER_APP_ROLES));

// "My" endpoints are inherently first-person — a caller with no linked Staff
// row (e.g. a pure ADMIN account) just has nothing of their own to show, not
// an error, so this returns null rather than throwing.
async function resolveOwnStaffId(userId: string): Promise<string | null> {
  const staff = await prisma.staff.findFirst({ where: { user_id: userId } });
  return staff?.id ?? null;
}

teacherRouter.get(
  "/schedule/today",
  asyncHandler(async (req, res) => {
    const staffId = await resolveOwnStaffId(req.user!.sub);
    if (!staffId) return res.json({ success: true, data: [] });

    const todayDayOfWeek = new Date().getDay();
    const slots = await prisma.routineSlot.findMany({
      where: { teacher_id: staffId, day_of_week: todayDayOfWeek },
      include: {
        class: { select: { id: true, name_en: true } },
        section: { select: { id: true, name: true } },
        subject: { select: { id: true, name_en: true } },
      },
      orderBy: { period_no: "asc" },
    });
    res.json({ success: true, data: slots });
  }),
);

teacherRouter.get(
  "/my-sections",
  asyncHandler(async (req, res) => {
    const staffId = await resolveOwnStaffId(req.user!.sub);
    if (!staffId) return res.json({ success: true, data: [] });

    const [classTeacherOf, assignments] = await Promise.all([
      prisma.section.findMany({
        where: { class_teacher_id: staffId },
        select: { id: true, name: true, class_id: true, class: { select: { name_en: true } } },
      }),
      prisma.subjectTeacherAssignment.findMany({
        where: { staff_id: staffId },
        include: {
          subject: { select: { class_id: true, name_en: true, class: { select: { name_en: true } } } },
          // section_id null means "all sections of this class" — resolve to
          // every actual section so the caller always gets concrete IDs.
        },
      }),
    ]);

    const bySection = new Map<string, { class_id: string; class_name: string; section_id: string; section_name: string }>();
    for (const s of classTeacherOf) {
      bySection.set(s.id, { class_id: s.class_id, class_name: s.class.name_en, section_id: s.id, section_name: s.name });
    }

    for (const a of assignments) {
      if (a.section_id) {
        if (bySection.has(a.section_id)) continue;
        const section = await prisma.section.findUnique({ where: { id: a.section_id }, select: { id: true, name: true } });
        if (section) {
          bySection.set(section.id, { class_id: a.subject.class_id, class_name: a.subject.class.name_en, section_id: section.id, section_name: section.name });
        }
      } else {
        const sections = await prisma.section.findMany({ where: { class_id: a.subject.class_id }, select: { id: true, name: true } });
        for (const section of sections) {
          if (bySection.has(section.id)) continue;
          bySection.set(section.id, { class_id: a.subject.class_id, class_name: a.subject.class.name_en, section_id: section.id, section_name: section.name });
        }
      }
    }

    res.json({ success: true, data: [...bySection.values()] });
  }),
);
