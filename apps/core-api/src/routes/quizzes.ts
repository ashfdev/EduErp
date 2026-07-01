import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/permission.js';

export const quizzesRouter = Router();

quizzesRouter.use(requireAuth, requireTenant);

// ── Question bank ──────────────────────────────────────────────────
const questionSchema = z.object({
  subjectId: z.string().min(1),
  questionText: z.string().min(1),
  options: z.array(z.object({ key: z.string().min(1), text: z.string().min(1) })).min(2),
  correctOption: z.string().min(1),
  marks: z.number().int().positive().default(1),
});

quizzesRouter.post('/questions', requirePermission('exams', 'write'), async (req, res) => {
  const parsed = questionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const question = await req.db!.question.create({ data: { ...parsed.data, tenantId: req.tenantId!, createdBy: req.user!.sub } });
  return res.status(201).json(question);
});

quizzesRouter.get('/questions', requirePermission('exams', 'write'), async (req, res) => {
  const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined;
  const questions = await req.db!.question.findMany({ where: subjectId ? { subjectId } : {} });
  res.json(questions);
});

// ── Quizzes (PRD v1 addition: online MCQ module) ──────────────────
const quizSchema = z.object({
  subjectId: z.string().min(1),
  examId: z.string().optional(),
  title: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  questionIds: z.array(z.string()).min(1),
});

quizzesRouter.post('/', requirePermission('exams', 'write'), async (req, res) => {
  const parsed = quizSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const quiz = await req.db!.quiz.create({ data: { ...parsed.data, tenantId: req.tenantId!, createdBy: req.user!.sub } });
  return res.status(201).json(quiz);
});

quizzesRouter.get('/', requirePermission('exams', 'read'), async (req, res) => {
  const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined;
  const quizzes = await req.db!.quiz.findMany({ where: { ...(subjectId ? { subjectId } : {}), isPublished: true } });
  res.json(quizzes);
});

quizzesRouter.post('/:id/publish', requirePermission('exams', 'manage'), async (req, res) => {
  const quiz = await req.db!.quiz.update({ where: { id: req.params.id as string }, data: { isPublished: true } });
  res.json(quiz);
});

// ── Taking a quiz (student self-service) ──────────────────────────
async function currentStudentId(db: NonNullable<Express.Request['db']>, userId: string): Promise<string | null> {
  const student = await db.student.findUnique({ where: { userId } });
  return student?.id ?? null;
}

quizzesRouter.post('/:id/start', requirePermission('exams', 'read'), async (req, res) => {
  const studentId = await currentStudentId(req.db!, req.user!.sub);
  if (!studentId) return res.status(403).json({ error: 'Only students can take quizzes' });

  const quiz = await req.db!.quiz.findUniqueOrThrow({ where: { id: req.params.id as string } });
  if (!quiz.isPublished) return res.status(403).json({ error: 'Quiz is not published' });

  const existing = await req.db!.quizAttempt.findUnique({ where: { quizId_studentId: { quizId: quiz.id, studentId } } });
  if (existing) return res.json(existing);

  const questionIds = quiz.questionIds as string[];
  const shuffled = [...questionIds].sort(() => Math.random() - 0.5);

  const attempt = await req.db!.quizAttempt.create({
    data: { tenantId: req.tenantId!, quizId: quiz.id, studentId, questionOrder: shuffled },
  });
  return res.status(201).json(attempt);
});

quizzesRouter.get('/:id/attempt', requirePermission('exams', 'read'), async (req, res) => {
  const studentId = await currentStudentId(req.db!, req.user!.sub);
  if (!studentId) return res.status(403).json({ error: 'Only students can view their attempt' });

  const attempt = await req.db!.quizAttempt.findUnique({ where: { quizId_studentId: { quizId: req.params.id as string, studentId } } });
  if (!attempt) return res.status(404).json({ error: 'No attempt started' });

  const questionIds = attempt.questionOrder as string[];
  const questions = await req.db!.question.findMany({ where: { id: { in: questionIds } } });
  // Never leak the correct answer to the student while the attempt is in progress.
  const sanitized = questionIds.map((id) => {
    const q = questions.find((x) => x.id === id)!;
    return { id: q.id, questionText: q.questionText, options: q.options, marks: q.marks };
  });

  return res.json({ attempt, questions: sanitized });
});

const submitSchema = z.object({ answers: z.record(z.string(), z.string()) });

quizzesRouter.post('/:id/submit', requirePermission('exams', 'read'), async (req, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'answers object is required' });

  const studentId = await currentStudentId(req.db!, req.user!.sub);
  if (!studentId) return res.status(403).json({ error: 'Only students can submit a quiz' });

  const attempt = await req.db!.quizAttempt.findUnique({ where: { quizId_studentId: { quizId: req.params.id as string, studentId } } });
  if (!attempt || attempt.status !== 'IN_PROGRESS') return res.status(400).json({ error: 'No in-progress attempt to submit' });

  const questionIds = attempt.questionOrder as string[];
  const questions = await req.db!.question.findMany({ where: { id: { in: questionIds } } });

  let score = 0;
  for (const q of questions) {
    if (parsed.data.answers[q.id] === q.correctOption) score += q.marks;
  }

  const updated = await req.db!.quizAttempt.update({
    where: { id: attempt.id },
    data: { answers: parsed.data.answers, score, status: 'GRADED', submittedAt: new Date() },
  });

  return res.json(updated);
});
