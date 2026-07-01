import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/permission.js';

export const disciplineRouter = Router();

disciplineRouter.use(requireAuth, requireTenant);

// Visible to Admin and Class Teacher only — never surfaced in student/guardian portal (PRD §5.8).
const createSchema = z.object({
  studentId: z.string().min(1),
  category: z.enum(['INCIDENT', 'COUNSELING', 'COMMENDATION']),
  description: z.string().min(1),
  actionTaken: z.string().optional(),
  occurredAt: z.coerce.date().optional(),
});

disciplineRouter.post('/', requirePermission('discipline', 'write'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const record = await req.db!.disciplineRecord.create({
    data: { ...parsed.data, recordedBy: req.user!.sub, tenantId: req.tenantId! },
  });

  return res.status(201).json(record);
});

disciplineRouter.get('/', requirePermission('discipline', 'read'), async (req, res) => {
  const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
  if (!studentId) return res.status(400).json({ error: 'studentId is required' });

  const records = await req.db!.disciplineRecord.findMany({
    where: { studentId },
    orderBy: { occurredAt: 'desc' },
  });

  return res.json(records);
});
