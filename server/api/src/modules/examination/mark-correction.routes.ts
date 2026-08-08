import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { EXAM_MANAGE_ROLES, MARK_ENTRY_ROLES } from "../../lib/roles";
import { createMarkCorrectionRequestSchema, approveMarkCorrectionSchema, rejectMarkCorrectionSchema } from "@education-erp/validators";
import { isTeacherAssignedToSubjectSections, syncExpiredMarkCorrections } from "../../utils/mark-correction";
import { resolveOwnStaffId } from "../../lib/own-staff";
import { createInAppNotification, notifyRoles } from "../../services/in-app-notification.service";
import { badRequest, forbidden, notFound } from "../../lib/errors";

export const markCorrectionRouter = Router();
markCorrectionRouter.use(authenticate);

// Small shared lookup — every route below needs to show a human-readable
// subject/exam name, but MarkCorrectionRequest deliberately has no Prisma
// relations (see the schema comment), so this resolves them via one
// targeted query instead of forcing every route to repeat it.
async function attachDisplayNames<T extends { exam_id: string; subject_id: string; teacher_id: string }>(rows: T[]) {
  if (!rows.length) return [];
  const examIds = [...new Set(rows.map((r) => r.exam_id))];
  const subjectIds = [...new Set(rows.map((r) => r.subject_id))];
  const teacherIds = [...new Set(rows.map((r) => r.teacher_id))];
  const [exams, subjects, teachers] = await Promise.all([
    prisma.exam.findMany({ where: { id: { in: examIds } }, select: { id: true, name: true } }),
    prisma.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name_en: true } }),
    prisma.staff.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name_en: true } }),
  ]);
  const examById = new Map(exams.map((e) => [e.id, e.name]));
  const subjectById = new Map(subjects.map((s) => [s.id, s.name_en]));
  const teacherById = new Map(teachers.map((t) => [t.id, t.name_en]));
  return rows.map((r) => ({ ...r, exam_name: examById.get(r.exam_id) ?? "", subject_name: subjectById.get(r.subject_id) ?? "", teacher_name: teacherById.get(r.teacher_id) ?? "" }));
}

// Teacher self-service create — reuses the exact same ownership check
// marks.routes.ts's /submit already uses via the shared helper, so the two
// checks can never drift.
markCorrectionRouter.post(
  "/",
  authorize(MARK_ENTRY_ROLES),
  asyncHandler(async (req, res) => {
    const body = createMarkCorrectionRequestSchema.parse(req.body);

    const exam = await prisma.exam.findUnique({ where: { id: body.exam_id } });
    if (!exam) throw notFound("Exam not found");
    // A correction request only makes sense once mark entry has actually
    // closed (COMPLETED) and before the result is public (PUBLISHED) —
    // symmetric with POST /exams/:id/reopen's own COMPLETED-only scope.
    if (exam.status !== "COMPLETED") {
      throw badRequest(`Correction requests can only be filed for a COMPLETED exam (current status: ${exam.status})`);
    }

    const subject = await prisma.subject.findUnique({ where: { id: body.subject_id } });
    if (!subject) throw notFound("Subject not found");

    if (body.section_id) {
      const section = await prisma.section.findFirst({ where: { id: body.section_id, class_id: subject.class_id } });
      if (!section) throw badRequest("The selected section does not belong to this subject's class");
    }

    const { assigned, staffId } = await isTeacherAssignedToSubjectSections(req.user!.sub, [{ subject_id: body.subject_id, section_id: body.section_id ?? null }]);
    if (!staffId) throw forbidden("No staff record linked to this account");
    if (!assigned) throw forbidden("You can only request a correction for a subject assigned to you");

    const request = await prisma.markCorrectionRequest.create({
      data: {
        exam_id: body.exam_id,
        class_id: subject.class_id,
        section_id: body.section_id ?? null,
        subject_id: body.subject_id,
        teacher_id: staffId,
        reason: body.reason,
      },
    });

    await notifyRoles(EXAM_MANAGE_ROLES, {
      type: "MARK_CORRECTION_REQUESTED",
      title: "New mark correction request",
      body: `${subject.name_en} — ${exam.name}`,
      link: "/examination/mark-corrections",
    });

    res.status(201).json({ success: true, data: request });
  }),
);

markCorrectionRouter.get(
  "/mine",
  authorize(MARK_ENTRY_ROLES),
  asyncHandler(async (req, res) => {
    await syncExpiredMarkCorrections();
    const staffId = await resolveOwnStaffId(req.user!.sub);
    const rows = await prisma.markCorrectionRequest.findMany({ where: { teacher_id: staffId }, orderBy: { created_at: "desc" } });
    res.json({ success: true, data: await attachDisplayNames(rows) });
  }),
);

markCorrectionRouter.get(
  "/pending",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (_req, res) => {
    await syncExpiredMarkCorrections();
    const rows = await prisma.markCorrectionRequest.findMany({ where: { status: "PENDING" }, orderBy: { created_at: "asc" } });
    res.json({ success: true, data: await attachDisplayNames(rows) });
  }),
);

// Every request regardless of status, for the admin queue's "Approved /
// Revoked" history tab (distinct from /pending, which is scoped to just
// the actionable PENDING queue).
markCorrectionRouter.get(
  "/",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (_req, res) => {
    await syncExpiredMarkCorrections();
    const rows = await prisma.markCorrectionRequest.findMany({ orderBy: { created_at: "desc" } });
    res.json({ success: true, data: await attachDisplayNames(rows) });
  }),
);

markCorrectionRouter.put(
  "/:id/approve",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = approveMarkCorrectionSchema.parse(req.body);
    const request = await prisma.markCorrectionRequest.findUnique({ where: { id } });
    if (!request) throw notFound("Correction request not found");
    if (request.status !== "PENDING") throw badRequest("Only a pending correction request can be approved");

    const updated = await prisma.markCorrectionRequest.update({
      where: { id },
      data: { status: "APPROVED", reviewed_by_id: req.user!.sub, reviewed_at: new Date(), expires_at: body.expires_at ?? null, decision_note: body.decision_note },
    });

    const teacher = await prisma.staff.findUnique({ where: { id: request.teacher_id }, select: { user_id: true, name_en: true } });
    const subject = await prisma.subject.findUnique({ where: { id: request.subject_id }, select: { name_en: true } });
    if (teacher?.user_id) {
      await createInAppNotification({
        userId: teacher.user_id,
        type: "MARK_CORRECTION_APPROVED",
        title: "Mark correction request approved",
        body: subject?.name_en,
        link: "/marks",
      });
    }

    res.json({ success: true, data: updated });
  }),
);

markCorrectionRouter.put(
  "/:id/reject",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = rejectMarkCorrectionSchema.parse(req.body);
    const request = await prisma.markCorrectionRequest.findUnique({ where: { id } });
    if (!request) throw notFound("Correction request not found");
    if (request.status !== "PENDING") throw badRequest("Only a pending correction request can be rejected");

    const updated = await prisma.markCorrectionRequest.update({
      where: { id },
      data: { status: "REJECTED", reviewed_by_id: req.user!.sub, reviewed_at: new Date(), decision_note: body.decision_note },
    });

    const teacher = await prisma.staff.findUnique({ where: { id: request.teacher_id }, select: { user_id: true } });
    const subject = await prisma.subject.findUnique({ where: { id: request.subject_id }, select: { name_en: true } });
    if (teacher?.user_id) {
      await createInAppNotification({
        userId: teacher.user_id,
        type: "MARK_CORRECTION_REJECTED",
        title: "Mark correction request rejected",
        body: `${subject?.name_en ?? ""} — ${body.decision_note}`,
        link: "/marks",
      });
    }

    res.json({ success: true, data: updated });
  }),
);

markCorrectionRouter.put(
  "/:id/revoke",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const request = await prisma.markCorrectionRequest.findUnique({ where: { id } });
    if (!request) throw notFound("Correction request not found");
    if (!["PENDING", "APPROVED"].includes(request.status)) throw badRequest("Only a pending or approved correction request can be revoked");

    const updated = await prisma.markCorrectionRequest.update({
      where: { id },
      data: { status: "REVOKED", revoked_by_id: req.user!.sub, revoked_at: new Date() },
    });

    res.json({ success: true, data: updated });
  }),
);
