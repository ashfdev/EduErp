import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { EXAM_MANAGE_ROLES } from "../../lib/roles";
import { createExamSchema, examStatusSchema, subjectConfigSchema, seatPlanGenerateSchema } from "@education-erp/validators";
import { badRequest, notFound } from "../../lib/errors";

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
      include: { exam_type_config: true, academic_year: true, grading_scale: true, subject_configs: { include: { subject: { include: { class: true } } } } },
    });
    if (!exam) throw notFound("Exam not found");
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
      include: { student: { select: { name_en: true, student_uid: true, current_class: { select: { name_en: true } } } } },
      orderBy: [{ hall_name: "asc" }, { seat_number: "asc" }],
    });
    res.json({ success: true, data: plans });
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
