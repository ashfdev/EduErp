import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { EXAM_MANAGE_ROLES } from "../../lib/roles";
import { createExamSchema, cloneExamSchema, examStatusSchema, subjectConfigSchema, seatPlanGenerateSchema, markComponentConfigSchema } from "@education-erp/validators";
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
  asyncHandler(async (req, res) => {
    const query = z.object({ academic_year_id: z.string().optional(), status: z.string().optional() }).parse(req.query);
    const exams = await prisma.exam.findMany({
      where: { deleted_at: null, ...(query.academic_year_id && { academic_year_id: query.academic_year_id }), ...(query.status && { status: query.status as never }) },
      include: { exam_type_config: true, academic_year: true, subject_configs: true },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: exams });
  }),
);

examsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const exam = await prisma.exam.findUnique({
      where: { id },
      include: {
        exam_type_config: true,
        academic_year: true,
        grading_scale: true,
        subject_configs: { include: { subject: { include: { class: true, group: true } } }, orderBy: { subject: { created_at: "asc" } } },
        component_configs: { orderBy: { display_order: "asc" } },
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
          exam_type_config_id: body.exam_type_config_id,
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
// retype an exam TYPE each time (that dropdown already existed), it was
// that the free-text `name` and every subject's mark-rule overrides had to
// be rebuilt from scratch every year. This copies exam_type_config_id,
// grading_scale_id, and — per subject CODE, not subject id, since Subject
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
      include: { exam_type_config: true, academic_year: true, subject_configs: { include: { subject: true } } },
    });
    if (!source) throw notFound("Source exam not found");

    const newYear = await prisma.academicYear.findUnique({ where: { id: body.academic_year_id } });
    if (!newYear) throw notFound("Academic year not found");

    const targetClasses = await prisma.class.findMany({ where: { id: { in: body.class_ids } } });
    if (targetClasses.length !== body.class_ids.length) throw notFound("One or more classes not found");
    if (targetClasses.some((c) => c.academic_year_id !== body.academic_year_id)) {
      throw badRequest("All selected classes must belong to the target academic year");
    }

    const name = body.name?.trim() || `${source.exam_type_config.name} ${newYear.label}`;
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
          exam_type_config_id: source.exam_type_config_id,
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
        await tx.examSubjectConfig.createMany({
          data: subjects.map((s) => {
            const override = overridesByCode.get(`${s.class_id}::${s.code}`);
            return {
              exam_id: created.id,
              subject_id: s.id,
              full_marks_theory: override?.full_marks_theory ?? s.full_marks,
              full_marks_practical: override?.full_marks_practical ?? 0,
              pass_marks_theory: override?.pass_marks_theory ?? s.pass_marks,
              pass_marks_practical: override?.pass_marks_practical ?? 0,
              pass_marks_combined: override?.pass_marks_combined ?? s.pass_marks,
            };
          }),
        });
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

// Full replace, not upsert-by-key — a subject's component list is short and
// edited as a whole from one small admin form, so there's no benefit to
// diffing individual rows the way subject-config (one row per subject,
// edited independently) does.
examsRouter.put(
  "/:id/subject-config/:subject_id/components",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const subjectId = reqParam(req, "subject_id");
    const body = markComponentConfigSchema.parse(req.body);

    const keys = body.components.map((c) => c.key);
    if (new Set(keys).size !== keys.length) throw badRequest("Component keys must be unique within a subject");

    await prisma.$transaction([
      prisma.markComponentConfig.deleteMany({ where: { exam_id: id, subject_id: subjectId } }),
      ...(body.components.length
        ? [
            prisma.markComponentConfig.createMany({
              data: body.components.map((c, i) => ({
                exam_id: id,
                subject_id: subjectId,
                key: c.key,
                label: c.label,
                max_marks: c.max_marks,
                display_order: c.display_order ?? i,
              })),
            }),
          ]
        : []),
    ]);

    const components = await prisma.markComponentConfig.findMany({ where: { exam_id: id, subject_id: subjectId }, orderBy: { display_order: "asc" } });
    res.json({ success: true, data: components });
  }),
);

examsRouter.post(
  "/:id/seat-plan/generate",
  authorize(EXAM_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = seatPlanGenerateSchema.parse(req.body);

    const configs = await prisma.examSubjectConfig.findMany({ where: { exam_id: id }, include: { subject: true } });
    const classIds = [...new Set(configs.map((c) => c.subject.class_id))];
    const students = await prisma.student.findMany({
      where: { current_class_id: { in: classIds }, deleted_at: null, status: "ACTIVE" },
      orderBy: [{ current_class_id: "asc" }, { name_en: "asc" }],
    });

    await prisma.examSeatPlan.deleteMany({ where: { exam_id: id } });

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
      return { exam_id: id, student_id: s.id, hall_name: hall.name, seat_number: String(seatInHall) };
    });

    if (plans.length > 0) await prisma.examSeatPlan.createMany({ data: plans });
    res.json({ success: true, data: { generated: plans.length } });
  }),
);

examsRouter.get(
  "/:id/seat-plan",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const plans = await prisma.examSeatPlan.findMany({
      where: { exam_id: id },
      include: {
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
      orderBy: [{ hall_name: "asc" }, { seat_number: "asc" }],
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
