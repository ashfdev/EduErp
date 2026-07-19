import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { resolveOwnStaffId } from "../../lib/own-staff";
import { QUIZ_MANAGE_ROLES } from "../../lib/roles";
import { createQuestionSchema, createQuizSchema } from "@education-erp/validators";
import { forbidden, notFound } from "../../lib/errors";

// Simpler than the class-based ownership check used for TeachingResource —
// keyed directly off subject_id + SubjectTeacherAssignment, per the plan
// (don't over-port that complexity here). ADMIN/PRINCIPAL/EXAM_CONTROLLER
// bypass; SUBJECT_TEACHER must actually be assigned to the subject.
const QUIZ_OVERSIGHT_ROLES = ["ADMIN", "SUPER_ADMIN", "PRINCIPAL", "EXAM_CONTROLLER"];

async function assertSubjectOwnership(userId: string, role: string, subjectId: string): Promise<void> {
  if (QUIZ_OVERSIGHT_ROLES.includes(role)) return;
  const staffId = await resolveOwnStaffId(userId);
  const assignment = await prisma.subjectTeacherAssignment.findFirst({ where: { staff_id: staffId, subject_id: subjectId } });
  if (!assignment) throw forbidden("You are not assigned to this subject");
}

// Drives the two list endpoints below — null means no restriction
// (oversight roles see everything); otherwise the caller's real assigned
// subject ids, so a SUBJECT_TEACHER can never browse another teacher's
// question bank/quizzes just by knowing they exist.
async function getVisibleSubjectIds(userId: string, role: string): Promise<string[] | null> {
  if (QUIZ_OVERSIGHT_ROLES.includes(role)) return null;
  const staffId = await resolveOwnStaffId(userId);
  const assignments = await prisma.subjectTeacherAssignment.findMany({ where: { staff_id: staffId } });
  return [...new Set(assignments.map((a) => a.subject_id))];
}

export const quizzesRouter = Router();
quizzesRouter.use(authenticate, authorize(QUIZ_MANAGE_ROLES));

quizzesRouter.get(
  "/questions",
  asyncHandler(async (req, res) => {
    const query = z.object({ subject_id: z.string().optional() }).parse(req.query);
    const visibleSubjectIds = await getVisibleSubjectIds(req.user!.sub, req.user!.role);
    if (visibleSubjectIds && query.subject_id && !visibleSubjectIds.includes(query.subject_id)) {
      return res.json({ success: true, data: [] });
    }
    const questions = await prisma.question.findMany({
      where: {
        is_active: true,
        ...(query.subject_id ? { subject_id: query.subject_id } : visibleSubjectIds ? { subject_id: { in: visibleSubjectIds } } : {}),
      },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: questions });
  }),
);

quizzesRouter.post(
  "/questions",
  asyncHandler(async (req, res) => {
    const body = createQuestionSchema.parse(req.body);
    await assertSubjectOwnership(req.user!.sub, req.user!.role, body.subject_id);
    const question = await prisma.question.create({ data: { ...body, created_by_id: req.user!.sub } });
    res.status(201).json({ success: true, data: question });
  }),
);

quizzesRouter.get(
  "/quizzes",
  asyncHandler(async (req, res) => {
    const query = z.object({ subject_id: z.string().optional() }).parse(req.query);
    const visibleSubjectIds = await getVisibleSubjectIds(req.user!.sub, req.user!.role);
    if (visibleSubjectIds && query.subject_id && !visibleSubjectIds.includes(query.subject_id)) {
      return res.json({ success: true, data: [] });
    }
    const quizzes = await prisma.quiz.findMany({
      where: {
        ...(query.subject_id ? { subject_id: query.subject_id } : visibleSubjectIds ? { subject_id: { in: visibleSubjectIds } } : {}),
      },
      include: { subject: { select: { name_en: true } }, _count: { select: { questions: true, attempts: true } } },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: quizzes });
  }),
);

quizzesRouter.post(
  "/quizzes",
  asyncHandler(async (req, res) => {
    const body = createQuizSchema.parse(req.body);
    await assertSubjectOwnership(req.user!.sub, req.user!.role, body.subject_id);

    const quiz = await prisma.$transaction(async (tx) => {
      const created = await tx.quiz.create({
        data: {
          subject_id: body.subject_id,
          exam_id: body.exam_id ?? null,
          title: body.title,
          duration_minutes: body.duration_minutes,
          created_by_id: req.user!.sub,
        },
      });
      await tx.quizQuestion.createMany({
        data: body.question_ids.map((questionId, i) => ({ quiz_id: created.id, question_id: questionId, display_order: i })),
      });
      return created;
    });

    res.status(201).json({ success: true, data: quiz });
  }),
);

async function loadOwnQuizOr404(quizId: string, userId: string, role: string) {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) throw notFound("Quiz not found");
  // Bypass list must match assertSubjectOwnership's exactly — otherwise a
  // PRINCIPAL/EXAM_CONTROLLER who can create a quiz for any subject (via
  // assertSubjectOwnership) gets 404'd trying to publish/view attempts on a
  // quiz a teacher created, breaking the intended exam-office oversight role.
  if (!QUIZ_OVERSIGHT_ROLES.includes(role)) {
    const staffId = await resolveOwnStaffId(userId);
    if (quiz.created_by_id !== userId && quiz.created_by_id !== staffId) {
      // created_by_id stores the User id (req.user.sub), not staff id —
      // keep both checks since other "who did this" fields in this codebase
      // are inconsistent about which id they store.
      throw notFound("Quiz not found");
    }
  }
  return quiz;
}

quizzesRouter.put(
  "/quizzes/:id/publish",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await loadOwnQuizOr404(id, req.user!.sub, req.user!.role);
    const quiz = await prisma.quiz.update({ where: { id }, data: { is_published: true } });
    res.json({ success: true, data: quiz });
  }),
);

quizzesRouter.get(
  "/quizzes/:id/attempts",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await loadOwnQuizOr404(id, req.user!.sub, req.user!.role);
    const attempts = await prisma.quizAttempt.findMany({
      where: { quiz_id: id },
      include: { student: { select: { name_en: true, student_uid: true } } },
      orderBy: { started_at: "desc" },
    });
    res.json({
      success: true,
      data: attempts.map((a) => ({
        ...a,
        tamper_flag_count: Array.isArray(a.tamper_flags) ? a.tamper_flags.length : 0,
      })),
    });
  }),
);
