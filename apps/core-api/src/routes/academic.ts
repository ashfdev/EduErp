import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/permission.js';

export const academicRouter = Router();

academicRouter.use(requireAuth, requireTenant);

// ── Classes ────────────────────────────────────────────────────────
const classSchema = z.object({
  academicYearId: z.string().min(1),
  name: z.string().min(1),
  level: z.number().int(),
  order: z.number().int().optional(),
});

academicRouter.get('/classes', async (req, res) => {
  const academicYearId = typeof req.query.academicYearId === 'string' ? req.query.academicYearId : undefined;
  const classes = await req.db!.class.findMany({
    where: academicYearId ? { academicYearId } : {},
    include: { sections: true },
    orderBy: { order: 'asc' },
  });
  res.json(classes);
});

academicRouter.post('/classes', requirePermission('academic', 'write'), async (req, res) => {
  const parsed = classSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const klass = await req.db!.class.create({ data: { ...parsed.data, tenantId: req.tenantId! } });
  return res.status(201).json(klass);
});

// ── Sections ───────────────────────────────────────────────────────
const sectionSchema = z.object({
  classId: z.string().min(1),
  name: z.string().min(1),
  shiftId: z.string().optional(),
  classTeacherId: z.string().optional(),
});

academicRouter.get('/sections', async (req, res) => {
  const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
  const sections = await req.db!.section.findMany({
    where: classId ? { classId } : {},
    include: { class: true, shift: true, classTeacher: { include: { user: { select: { name: true } } } } },
  });
  res.json(sections);
});

academicRouter.post('/sections', requirePermission('academic', 'write'), async (req, res) => {
  const parsed = sectionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const section = await req.db!.section.create({ data: parsed.data });
  return res.status(201).json(section);
});

// ── Subjects ───────────────────────────────────────────────────────
const subjectSchema = z.object({
  classId: z.string().min(1),
  nameEn: z.string().min(1),
  nameBn: z.string().optional(),
  code: z.string().min(1),
  isCompulsory: z.boolean().optional(),
  isOptional: z.boolean().optional(),
});

academicRouter.get('/subjects', async (req, res) => {
  const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
  const subjects = await req.db!.subject.findMany({ where: classId ? { classId } : {} });
  res.json(subjects);
});

academicRouter.post('/subjects', requirePermission('academic', 'write'), async (req, res) => {
  const parsed = subjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const subject = await req.db!.subject.create({ data: parsed.data });
  return res.status(201).json(subject);
});
