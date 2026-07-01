import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/permission.js';

export const attendanceRouter = Router();

attendanceRouter.use(requireAuth, requireTenant);

const STATUS_ENUM = z.enum(['PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'HALF_DAY']);

// Bulk mark: client sends the full roster's final status (teacher UI does "mark all
// present" then flags exceptions locally, see PRD §6.2) — server upserts each row.
const markSchema = z.object({
  sectionId: z.string().min(1),
  date: z.coerce.date(),
  shiftId: z.string().optional(),
  periodNo: z.number().int().default(0),
  records: z
    .array(
      z.object({
        personId: z.string().min(1),
        personType: z.enum(['STUDENT', 'STAFF']).default('STUDENT'),
        status: STATUS_ENUM,
        overrideReason: z.string().optional(),
      }),
    )
    .min(1),
});

attendanceRouter.post('/mark', requirePermission('attendance', 'write'), async (req, res) => {
  const parsed = markSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const { date, periodNo, records } = parsed.data;
  const dateOnly = new Date(date.toISOString().slice(0, 10));
  const tenantId = req.tenantId!;

  const results = await req.db!.$transaction(
    records.map((r) =>
      req.db!.attendanceRecord.upsert({
        where: {
          tenantId_personId_date_periodNo: {
            tenantId,
            personId: r.personId,
            date: dateOnly,
            periodNo,
          },
        },
        create: {
          personId: r.personId,
          personType: r.personType,
          date: dateOnly,
          shiftId: parsed.data.shiftId,
          periodNo,
          status: r.status,
          source: 'MANUAL',
          markedBy: req.user!.sub,
          overrideReason: r.overrideReason,
          tenantId,
        },
        update: {
          status: r.status,
          overrideReason: r.overrideReason,
          markedBy: req.user!.sub,
        },
      }),
    ),
  );

  return res.status(201).json({ count: results.length });
});

// Daily register: class/section list with present/absent status for a date (PRD §6.4).
attendanceRouter.get('/', requirePermission('attendance', 'read'), async (req, res) => {
  const query = z.object({ sectionId: z.string().min(1), date: z.coerce.date() }).safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: 'sectionId and date are required' });

  const dateOnly = new Date(query.data.date.toISOString().slice(0, 10));

  const students = await req.db!.student.findMany({
    where: { sectionId: query.data.sectionId },
    include: { user: { select: { name: true } } },
    orderBy: { rollNo: 'asc' },
  });

  const records = await req.db!.attendanceRecord.findMany({
    where: { personId: { in: students.map((s) => s.id) }, date: dateOnly },
  });
  const byPerson = new Map(records.map((r) => [r.personId, r]));

  return res.json(
    students.map((s) => ({
      studentId: s.id,
      studentUid: s.studentUid,
      rollNo: s.rollNo,
      name: s.user.name,
      status: byPerson.get(s.id)?.status ?? null,
      source: byPerson.get(s.id)?.source ?? null,
    })),
  );
});

// Monthly grid: student x date (PRD §6.4).
attendanceRouter.get('/report/monthly', requirePermission('attendance', 'read'), async (req, res) => {
  const query = z
    .object({ sectionId: z.string().min(1), year: z.coerce.number(), month: z.coerce.number().min(1).max(12) })
    .safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: 'sectionId, year, month are required' });

  const { sectionId, year, month } = query.data;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const students = await req.db!.student.findMany({
    where: { sectionId },
    include: { user: { select: { name: true } } },
    orderBy: { rollNo: 'asc' },
  });

  const records = await req.db!.attendanceRecord.findMany({
    where: { personId: { in: students.map((s) => s.id) }, date: { gte: start, lt: end } },
  });

  const grid = students.map((s) => ({
    studentId: s.id,
    studentUid: s.studentUid,
    name: s.user.name,
    days: records
      .filter((r) => r.personId === s.id)
      .map((r) => ({ date: r.date.toISOString().slice(0, 10), status: r.status })),
  }));

  return res.json(grid);
});

// Defaulter report: students below a configurable attendance threshold (PRD §6.4).
attendanceRouter.get('/report/defaulters', requirePermission('attendance', 'read'), async (req, res) => {
  const query = z
    .object({
      sectionId: z.string().min(1),
      from: z.coerce.date(),
      to: z.coerce.date(),
      thresholdPercent: z.coerce.number().min(0).max(100).default(75),
    })
    .safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: 'Invalid query', details: query.error.flatten() });

  const { sectionId, from, to, thresholdPercent } = query.data;

  const students = await req.db!.student.findMany({
    where: { sectionId },
    include: { user: { select: { name: true } } },
  });

  const records = await req.db!.attendanceRecord.findMany({
    where: { personId: { in: students.map((s) => s.id) }, date: { gte: from, lte: to } },
  });

  const defaulters = students
    .map((s) => {
      const studentRecords = records.filter((r) => r.personId === s.id);
      const total = studentRecords.length;
      const present = studentRecords.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
      const percent = total === 0 ? 100 : (present / total) * 100;
      return { studentId: s.id, studentUid: s.studentUid, name: s.user.name, attendancePercent: Math.round(percent * 100) / 100 };
    })
    .filter((s) => s.attendancePercent < thresholdPercent);

  return res.json(defaulters);
});
