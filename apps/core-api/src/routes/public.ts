import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';

export const publicRouter = Router();

// Public, no auth — result lookup calls the same underlying data the ERP uses
// internally (PRD §7.5/§4.13), just filtered to published-only. tenantId is
// explicit here rather than derived from a JWT since the caller (public-site)
// isn't authenticated; production would resolve it from the institution's
// domain instead once Phase 4's per-tenant public site routing exists.
// Rate-limited (gap-fix, flagged when this shipped in Phase 3) — without it,
// this is an open door to scripted roll-number scraping.
publicRouter.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }));

const lookupSchema = z.object({
  tenantId: z.string().min(1),
  examId: z.string().min(1),
  studentUid: z.string().min(1),
});

publicRouter.get('/results/lookup', async (req, res) => {
  const parsed = lookupSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'tenantId, examId, and studentUid are required' });

  const { tenantId, examId, studentUid } = parsed.data;

  const student = await prisma.student.findFirst({ where: { tenantId, studentUid }, include: { user: true } });
  if (!student) return res.status(404).json({ error: 'No matching student found' });

  const result = await prisma.examResult.findUnique({ where: { examId_studentId: { examId, studentId: student.id } } });
  if (!result) return res.status(404).json({ error: 'Result not found' });

  const publication = await prisma.resultPublication.findUnique({ where: { examId_classId: { examId, classId: result.classId } } });
  if (!publication?.isPublished) return res.status(404).json({ error: 'Result not published yet' });

  return res.json({
    studentUid: student.studentUid,
    name: student.user.name,
    gpa: result.gpa,
    letterGrade: result.letterGrade,
    hasFailed: result.hasFailed,
    positionInClass: result.positionInClass,
  });
});
