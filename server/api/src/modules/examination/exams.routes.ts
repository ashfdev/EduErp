import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { EXAM_MANAGE_ROLES, MARK_VIEW_ROLES } from "../../lib/roles";
import { createExamSchema, cloneExamSchema, examStatusSchema, subjectConfigSchema, seatPlanGenerateSchema, examSessionSchema, examMarkComponentsSchema } from "@education-erp/validators";
import { badRequest, notFound } from "../../lib/errors";
import { logAudit } from "../../lib/audit-log";

export const examsRouter = Router();
examsRouter.use(authenticate);

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["ACTIVE"],
  ACTIVE: ["MARK_ENTRY"],
  MARK_ENTRY: ["COMPLETED"],
  COMPLETED: ["PUBLISHED"],
  PUBLISHED: [],
};

examsRouter.get(
  "/",
  // MARK_VIEW_ROLES (not EXAM_MANAGE_ROLES) — apps/teacher's Marks Picker
  // fetches this directly for CLASS_TEACHER/SUBJECT_TEACHER accounts to
  // populate the exam dropdown; gating to EXAM_MANAGE_ROLES only would
  // break that flow.
  authorize(MARK_VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ academic_year_id: z.string().optional(), status: z.string().optional() }).parse(req.query);
    const exams = await prisma.exam.findMany({
      where: { deleted_at: null, ...(query.academic_year_id && { academic_year_id: query.academic_year_id }), ...(query.status && { status: query.status as never }) },
      include: { academic_year: true, subject_configs: true },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: exams });
  }),
);

examsRouter.get(
  "/:id",
  authorize(MARK_VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const exam = await prisma.exam.findUnique({
      where: { id },
      include: {
        academic_year: true,
        grading_scale: true,
        subject_configs: { include: { subject: { include: { class: true, group: true } } }, orderBy: { subject: { created_at: "asc" } } },
        mark_components: { include: { source_exams: true }, orderBy: { display_order: "asc" } },
      },
    });
    if (!exam) throw notFound("Exam not found");

    // Same legacy-duplicate-subject defensive filter as marks.routes.ts /
    // subjects.routes.ts — a duplicate-named Subject row would otherwise
    // surface here as two independently-editable full-marks/pass-marks
    // configs under what looks like one subject.
    const seenSubjectNames = new Set<string>();
    exam.subject_configs = exam.subject_configs.filter((c) => {
      const k = `${c.subject.class_id}:${c.subject.name_en.trim().toLowerCase()}`;
      if (seenSubjectNames.has(k)) return false;
      seenSubjectNames.add(k);
      return true;
    });

    res.json({ success: true, data: exam });
  }),
);

examsRouter.post(
  "/",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = createExamSchema.parse(req.body);

    const exam = await prisma.$transaction(async (tx) => {
      const created = await tx.exam.create({
        data: {
          name: body.name,
          academic_year_id: body.academic_year_id,
          start_date: body.start_date,
          end_date: body.end_date,
          mark_entry_opens_at: body.mark_entry_opens_at,
          mark_entry_closes_at: body.mark_entry_closes_at,
          grading_scale_id: body.grading_scale_id,
        },
      });

      const subjects = await tx.subject.findMany({ where: { class_id: { in: body.class_ids }, is_active: true } });
      if (subjects.length > 0) {
        await tx.examSubjectConfig.createMany({
          data: subjects.map((s) => ({
            exam_id: created.id,
            subject_id: s.id,
            full_marks_theory: s.full_marks,
            pass_marks_theory: s.pass_marks,
            pass_marks_combined: s.pass_marks,
          })),
        });
      }

      return created;
    });

    res.status(201).json({ success: true, data: exam });
  }),
);

// "Clone from previous exam" — the actual gap wasn't that admins had to
// retype the exam's name each time, it was that every subject's mark-rule
// overrides had to be rebuilt from scratch every year. This copies
// grading_scale_id and — per subject CODE, not subject id, since Subject
// rows are recreated each academic year alongside Class — any customized
// full_marks/pass_marks overrides the source exam had. A subject with no
// code match in the source (new subject this year) just gets the plain
// creation defaults, same as POST / already does.
examsRouter.post(
  "/:id/clone",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const sourceId = reqParam(req, "id");
    const body = cloneExamSchema.parse(req.body);
    const source = await prisma.exam.findUnique({
      where: { id: sourceId },
      include: { academic_year: true, subject_configs: { include: { subject: true } } },
    });
    if (!source) throw notFound("Source exam not found");

    const newYear = await prisma.academicYear.findUnique({ where: { id: body.academic_year_id } });
    if (!newYear) throw notFound("Academic year not found");

    const targetClasses = await prisma.class.findMany({ where: { id: { in: body.class_ids } } });
    if (targetClasses.length !== body.class_ids.length) throw notFound("One or more classes not found");
    if (targetClasses.some((c) => c.academic_year_id !== body.academic_year_id)) {
      throw badRequest("All selected classes must belong to the target academic year");
    }

    const name = body.name?.trim() || `${source.name} ${newYear.label}`;
    // Keyed by class_id+code, not code alone — Subject.code is only unique
    // per class (@@unique([class_id, code])), so a multi-class source exam
    // can have the same code in two different classes with different
    // overrides; keying by code alone would let one class's override
    // silently clobber the other's in this map.
    const overridesByCode = new Map(source.subject_configs.map((c) => [`${c.subject.class_id}::${c.subject.code}`, c]));

    const exam = await prisma.$transaction(async (tx) => {
      const created = await tx.exam.create({
        data: {
          name,
          academic_year_id: body.academic_year_id,
          start_date: body.start_date,
          end_date: body.end_date,
          mark_entry_opens_at: body.mark_entry_opens_at,
          mark_entry_closes_at: body.mark_entry_closes_at,
          grading_scale_id: source.grading_scale_id,
        },
      });

      const subjects = await tx.subject.findMany({ where: { class_id: { in: body.class_ids }, is_active: true } });
      if (subjects.length > 0) {
        const resolvedTotals = subjects.map((s) => {
          const override = overridesByCode.get(`${s.class_id}::${s.code}`);
          return {
            subject_id: s.id,
            full_marks_theory: override?.full_marks_theory ?? s.full_marks,
            full_marks_practical: override?.full_marks_practical ?? 0,
            pass_marks_theory: override?.pass_marks_theory ?? s.pass_marks,
            pass_marks_practical: override?.pass_marks_practical ?? 0,
            pass_marks_combined: override?.pass_marks_combined ?? s.pass_marks,
          };
        });
        await tx.examSubjectConfig.createMany({ data: resolvedTotals.map(({ subject_id, ...rest }) => ({ exam_id: created.id, subject_id, ...rest })) });
      }

      return created;
    });

    res.status(201).json({ success: true, data: exam });
  }),
);

examsRouter.put(
  "/:id",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.exam.findUnique({ where: { id } });
    if (!existing) throw notFound("Exam not found");
    if (existing.status !== "DRAFT") throw badRequest("Only DRAFT exams can be edited");

    const body = createExamSchema.omit({ class_ids: true }).partial().parse(req.body);
    const exam = await prisma.exam.update({ where: { id }, data: body });
    res.json({ success: true, data: exam });
  }),
);

examsRouter.delete(
  "/:id",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.exam.findUnique({ where: { id } });
    if (!existing) throw notFound("Exam not found");
    if (existing.status !== "DRAFT") throw badRequest("Only DRAFT exams can be deleted");
    // Soft delete, matching Student/Staff — never hard-delete exam data per CLAUDE.md,
    // even a DRAFT exam with no marks yet, so it stays in the audit trail.
    await prisma.exam.update({ where: { id }, data: { deleted_at: new Date() } });
    res.status(204).send();
  }),
);

examsRouter.put(
  "/:id/status",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = examStatusSchema.parse(req.body);
    const existing = await prisma.exam.findUnique({ where: { id } });
    if (!existing) throw notFound("Exam not found");

    const allowed = VALID_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(body.status)) {
      throw badRequest(`Cannot transition from ${existing.status} to ${body.status}`);
    }

    const exam = await prisma.exam.update({ where: { id }, data: { status: body.status } });
    res.json({ success: true, data: exam });
  }),
);

// Deliberately narrower than the forward-only VALID_TRANSITIONS map above:
// this is the only reverse transition allowed anywhere in the exam
// lifecycle, and only COMPLETED -> MARK_ENTRY. Never reachable from
// PUBLISHED — a published, public-facing result needing correction is a
// materially bigger concern than an internal, not-yet-visible one, and is
// explicitly out of scope here (see Phase 73 plan notes).
examsRouter.post(
  "/:id/reopen",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.exam.findUnique({ where: { id } });
    if (!existing) throw notFound("Exam not found");
    if (existing.status !== "COMPLETED") {
      throw badRequest(`Only a COMPLETED exam can be reopened for correction (current status: ${existing.status})`);
    }

    const exam = await prisma.exam.update({ where: { id }, data: { status: "MARK_ENTRY" } });
    await logAudit("EXAM_REOPENED", { userId: req.user!.sub, targetType: "Exam", targetId: id, req });
    res.json({ success: true, data: exam });
  }),
);

examsRouter.put(
  "/:id/subject-config",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = subjectConfigSchema.parse(req.body);

    await prisma.$transaction(
      body.map((c) =>
        prisma.examSubjectConfig.upsert({
          where: { exam_id_subject_id: { exam_id: id, subject_id: c.subject_id } },
          create: { exam_id: id, ...c },
          update: c,
        }),
      ),
    );

    const configs = await prisma.examSubjectConfig.findMany({ where: { exam_id: id }, include: { subject: true } });
    res.json({ success: true, data: configs });
  }),
);

// Direct, fixed-mark-value mark composition for a subject under this exam
// (e.g. Theory 60 + MCQ 20 + Practical 20 = the subject's real total) —
// replaces the old separate "Theory Mark Breakdown" + "Grade Composition"
// dialogs with one unified list. Full replace, not upsert-by-key — the list
// is short and edited as a whole from one small admin form.
examsRouter.get(
  "/:id/subject-config/:subject_id/mark-components",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const components = await prisma.examMarkComponent.findMany({
      where: { exam_id: reqParam(req, "id"), subject_id: reqParam(req, "subject_id") },
      include: { source_exams: true },
      orderBy: { display_order: "asc" },
    });
    res.json({ success: true, data: components });
  }),
);

examsRouter.put(
  "/:id/subject-config/:subject_id/mark-components",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const subjectId = reqParam(req, "subject_id");
    const body = examMarkComponentsSchema.parse(req.body.components);

    const exam = await prisma.exam.findUnique({ where: { id } });
    if (!exam) throw notFound("Exam not found");
    // A composition must never change out from under marks that are already
    // being entered against it — mirrors PUT /:id's existing DRAFT-lock
    // precedent, widened to also allow ACTIVE (subject configuration is
    // still being finalized then, before Mark Entry actually opens).
    if (exam.status !== "DRAFT" && exam.status !== "ACTIVE") {
      throw badRequest("Mark composition can only be edited while the exam is Draft or Active");
    }

    const keys = body.map((c) => c.key);
    if (new Set(keys).size !== keys.length) throw badRequest("Component keys must be unique within a subject");

    if (body.length > 0) {
      for (const c of body) {
        if (c.source_type === "AVERAGE_OF_EXAMS" && (!c.source_exam_ids || c.source_exam_ids.length === 0)) {
          throw badRequest(`Component "${c.label}" must select at least one source exam to average from`);
        }
      }
      // Hard-validated: must sum exactly to the subject's real total — no
      // percentage math anywhere, a simple, one-sentence rule.
      const subjectConfig = await prisma.examSubjectConfig.findUnique({ where: { exam_id_subject_id: { exam_id: id, subject_id: subjectId } } });
      if (!subjectConfig) throw notFound("Subject is not configured for this exam");
      const subjectTotal = subjectConfig.full_marks_theory + subjectConfig.full_marks_practical;
      const componentTotal = Math.round(body.reduce((sum, c) => sum + c.max_marks, 0) * 100) / 100;
      if (Math.abs(componentTotal - subjectTotal) > 0.01) {
        throw badRequest(`Component marks must sum to this subject's total (${subjectTotal}), got ${componentTotal}`);
      }
    }

    // Individual creates (not createMany) — a nested source_exams create
    // needs each component's own generated id, which a flat createMany
    // batch can't provide. Still one transaction, still delete-and-recreate.
    await prisma.$transaction([
      prisma.examMarkComponent.deleteMany({ where: { exam_id: id, subject_id: subjectId } }),
      ...body.map((c, i) =>
        prisma.examMarkComponent.create({
          data: {
            exam_id: id,
            subject_id: subjectId,
            key: c.key,
            label: c.label,
            max_marks: c.max_marks,
            source_type: c.source_type,
            display_order: c.display_order ?? i,
            ...(c.source_type === "AVERAGE_OF_EXAMS" && c.source_exam_ids?.length
              ? { source_exams: { createMany: { data: c.source_exam_ids.map((source_exam_id) => ({ source_exam_id })) } } }
              : {}),
          },
        }),
      ),
    ]);

    const components = await prisma.examMarkComponent.findMany({
      where: { exam_id: id, subject_id: subjectId },
      include: { source_exams: true },
      orderBy: { display_order: "asc" },
    });
    res.json({ success: true, data: components });
  }),
);

// Sessions (Phase 83) — a real exam often runs across 2-3 separate time
// sessions with a different set of classes sitting in each. Defined before
// seat-plan generation so generation can seat one session's students at a
// time instead of mixing every class tied to the exam into one pass.
examsRouter.get(
  "/:id/sessions",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const sessions = await prisma.examSession.findMany({
      where: { exam_id: id },
      include: { classes: { include: { class: { select: { id: true, name_en: true } } } } },
      orderBy: { date: "asc" },
    });
    res.json({ success: true, data: sessions });
  }),
);

examsRouter.post(
  "/:id/sessions",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = examSessionSchema.parse(req.body);
    const session = await prisma.examSession.create({
      data: {
        exam_id: id,
        label: body.label,
        date: body.date,
        start_time: body.start_time,
        end_time: body.end_time,
        classes: { createMany: { data: body.class_ids.map((class_id) => ({ class_id })) } },
      },
      include: { classes: { include: { class: { select: { id: true, name_en: true } } } } },
    });
    res.status(201).json({ success: true, data: session });
  }),
);

examsRouter.delete(
  "/:id/sessions/:session_id",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const sessionId = reqParam(req, "session_id");
    await prisma.examSessionClass.deleteMany({ where: { session_id: sessionId } });
    await prisma.examSession.delete({ where: { id: sessionId } });
    res.status(204).send();
  }),
);

// Per-session generation — only seats students from classes assigned to
// this specific session, and only clears/replaces this session's own
// existing seat plans, so a hall name can be safely reused across two
// different sessions (their students are never in the room at the same
// time) without one session's regenerate touching another's assignments.
examsRouter.post(
  "/:id/sessions/:session_id/seat-plan/generate",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const sessionId = reqParam(req, "session_id");
    const body = seatPlanGenerateSchema.parse(req.body);

    const session = await prisma.examSession.findFirst({ where: { id: sessionId, exam_id: id } });
    if (!session) throw notFound("Exam session not found");

    const sessionClasses = await prisma.examSessionClass.findMany({ where: { session_id: sessionId } });
    const classIds = sessionClasses.map((sc) => sc.class_id);
    const students = await prisma.student.findMany({
      where: { current_class_id: { in: classIds }, deleted_at: null, status: "ACTIVE" },
      orderBy: [{ current_class_id: "asc" }, { name_en: "asc" }],
    });

    await prisma.examSeatPlan.deleteMany({ where: { exam_id: id, session_id: sessionId } });

    let hallIndex = 0;
    let seatInHall = 0;
    const plans = students.map((s) => {
      let hall = body.halls[hallIndex];
      if (!hall) {
        hallIndex = 0;
        seatInHall = 0;
        hall = body.halls[0]!;
      }
      if (seatInHall >= hall.capacity) {
        hallIndex = (hallIndex + 1) % body.halls.length;
        seatInHall = 0;
        hall = body.halls[hallIndex]!;
      }
      seatInHall++;
      return { exam_id: id, session_id: sessionId, student_id: s.id, hall_name: hall.name, seat_number: String(seatInHall) };
    });

    if (plans.length > 0) await prisma.examSeatPlan.createMany({ data: plans });
    res.json({ success: true, data: { generated: plans.length } });
  }),
);

examsRouter.get(
  "/:id/seat-plan",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const plans = await prisma.examSeatPlan.findMany({
      where: { exam_id: id },
      include: {
        session: { select: { id: true, label: true } },
        student: {
          select: {
            name_en: true,
            student_uid: true,
            current_class: { select: { name_en: true } },
            // Same amount_due+fine_amount minus amount_paid aggregation
            // fees/roster already uses — gives the exam-office approver a
            // due-amount flag without needing to cross-reference Fees.
            invoices: { where: { status: { not: "WAIVED" } }, select: { amount_due: true, amount_paid: true, fine_amount: true } },
          },
        },
      },
      orderBy: [{ session_id: "asc" }, { hall_name: "asc" }, { seat_number: "asc" }],
    });
    const data = plans.map((p) => {
      const { invoices, ...studentRest } = p.student;
      const totalDue = invoices.reduce((sum, i) => sum + i.amount_due + i.fine_amount, 0);
      const totalPaid = invoices.reduce((sum, i) => sum + i.amount_paid, 0);
      const outstanding = Math.max(0, totalDue - totalPaid);
      return { ...p, student: studentRest, outstanding_due: outstanding };
    });
    res.json({ success: true, data });
  }),
);

// Third leg of the admit-card clearance gate — a manual sign-off exam
// office staff give per student per exam (e.g. after confirming no
// disciplinary hold). Bulk so a whole class/hall can be cleared in one go
// once everything else checks out.
examsRouter.post(
  "/:id/seat-plan/clear",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = z.object({ student_ids: z.array(z.string().min(1)).min(1) }).parse(req.body);
    const result = await prisma.examSeatPlan.updateMany({
      where: { exam_id: id, student_id: { in: body.student_ids } },
      data: { exam_office_cleared: true, exam_office_cleared_by_id: req.user!.sub, exam_office_cleared_at: new Date() },
    });
    res.json({ success: true, data: { cleared: result.count } });
  }),
);
