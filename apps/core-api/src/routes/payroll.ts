import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/permission.js';

export const payrollRouter = Router();

payrollRouter.use(requireAuth, requireTenant);

// ── Salary structure (PRD §10.4) ──────────────────────────────────
const salaryStructureSchema = z.object({
  staffId: z.string().min(1),
  basic: z.number().nonnegative(),
  houseRent: z.number().nonnegative().default(0),
  medical: z.number().nonnegative().default(0),
  transport: z.number().nonnegative().default(0),
  providentFund: z.number().nonnegative().default(0),
  otherAllowances: z.record(z.string(), z.number()).optional(),
  deductions: z.record(z.string(), z.number()).optional(),
});

payrollRouter.put('/structures/:staffId', requirePermission('payroll', 'manage'), async (req, res) => {
  const parsed = salaryStructureSchema.safeParse({ ...req.body, staffId: req.params.staffId });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const { staffId, ...rest } = parsed.data;
  const structure = await req.db!.salaryStructure.upsert({
    where: { staffId },
    create: { ...rest, staffId, tenantId: req.tenantId! },
    update: rest,
  });

  return res.status(200).json(structure);
});

payrollRouter.get('/structures/:staffId', requirePermission('payroll', 'read'), async (req, res) => {
  const structure = await req.db!.salaryStructure.findUnique({ where: { staffId: req.params.staffId as string } });
  if (!structure) return res.status(404).json({ error: 'No salary structure set for this staff member' });
  return res.json(structure);
});

// ── Payroll run (PRD §10.4 — bulk processing, attendance-linked deductions) ──
const runSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000),
});

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

payrollRouter.post('/run', requirePermission('payroll', 'manage'), async (req, res) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const { month, year } = parsed.data;
  const structures = await req.db!.salaryStructure.findMany();
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  const totalDays = daysInMonth(year, month);

  const created = [];

  for (const structure of structures) {
    const existing = await req.db!.payrollRecord.findUnique({ where: { staffId_month_year: { staffId: structure.staffId, month, year } } });
    if (existing) continue;

    const staff = await req.db!.staff.findUniqueOrThrow({ where: { id: structure.staffId } });

    const absentDays = await req.db!.attendanceRecord.count({
      where: { personId: staff.userId, personType: 'STAFF', date: { gte: monthStart, lt: monthEnd }, status: 'ABSENT' },
    });

    const allowancesTotal = Object.values((structure.otherAllowances as Record<string, number> | null) ?? {}).reduce((a, b) => a + b, 0);
    const manualDeductionsTotal = Object.values((structure.deductions as Record<string, number> | null) ?? {}).reduce((a, b) => a + b, 0);

    const gross = Number(structure.basic) + Number(structure.houseRent) + Number(structure.medical) + Number(structure.transport) + allowancesTotal;
    const perDayRate = Number(structure.basic) / totalDays;
    const attendanceDeduction = perDayRate * absentDays;
    const deductions = Number(structure.providentFund) + manualDeductionsTotal + attendanceDeduction;
    const net = gross - deductions;

    const record = await req.db!.payrollRecord.create({
      data: { tenantId: req.tenantId!, staffId: structure.staffId, month, year, grossAmount: gross, deductions, netAmount: net, status: 'DRAFT' },
    });
    created.push(record);
  }

  return res.status(201).json({ createdCount: created.length, records: created });
});

const listQuery = z.object({ month: z.coerce.number().optional(), year: z.coerce.number().optional() });

payrollRouter.get('/records', requirePermission('payroll', 'read'), async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query' });

  const records = await req.db!.payrollRecord.findMany({
    where: { ...(parsed.data.month ? { month: parsed.data.month } : {}), ...(parsed.data.year ? { year: parsed.data.year } : {}) },
    include: { staff: { include: { user: { select: { name: true } } } } },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });
  res.json(records);
});

payrollRouter.post('/records/:id/process', requirePermission('payroll', 'manage'), async (req, res) => {
  const record = await req.db!.payrollRecord.update({
    where: { id: req.params.id as string },
    data: { status: 'PROCESSED', processedAt: new Date() },
  });
  return res.json(record);
});

// Payslip PDF rendering lands with Phase 3's Puppeteer Document Service (shared
// template system) — this returns the structured data a template will consume.
payrollRouter.get('/records/:id/payslip', requirePermission('payroll', 'read'), async (req, res) => {
  const record = await req.db!.payrollRecord.findUnique({
    where: { id: req.params.id as string },
    include: { staff: { include: { user: { select: { name: true } }, department: true } } },
  });
  if (!record) return res.status(404).json({ error: 'Payroll record not found' });
  return res.json(record);
});
