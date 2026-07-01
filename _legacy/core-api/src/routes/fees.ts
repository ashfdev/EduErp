import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/permission.js';
import { getGateway, GatewayNotConfiguredError } from '../lib/payments/index.js';
import { computeLateFee } from '../lib/lateFee.js';
import { sendOtp } from '../lib/notify.js';

export const feesRouter = Router();

feesRouter.use(requireAuth, requireTenant);

const FEE_CATEGORIES = [
  'ADMISSION', 'TUITION', 'SESSION', 'EXAM', 'TRANSPORT', 'HOSTEL', 'LAB', 'LIBRARY', 'SPORTS', 'DEVELOPMENT', 'OTHER',
] as const;

// ── Fee structures (PRD §10.1) ────────────────────────────────────
const feeStructureSchema = z.object({
  academicYearId: z.string().min(1),
  classId: z.string().optional(),
  sectionId: z.string().optional(),
  category: z.enum(FEE_CATEGORIES),
  amount: z.number().positive(),
  frequency: z.enum(['ONE_TIME', 'MONTHLY', 'TERM', 'YEARLY']),
  dueDay: z.number().int().min(1).max(31).optional(),
  lateFeePerDay: z.number().nonnegative().optional(),
});

feesRouter.get('/structures', requirePermission('fees', 'read'), async (req, res) => {
  const academicYearId = typeof req.query.academicYearId === 'string' ? req.query.academicYearId : undefined;
  const structures = await req.db!.feeStructure.findMany({
    where: academicYearId ? { academicYearId } : {},
    orderBy: { createdAt: 'desc' },
  });
  res.json(structures);
});

feesRouter.post('/structures', requirePermission('fees', 'manage'), async (req, res) => {
  const parsed = feeStructureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const structure = await req.db!.feeStructure.create({ data: { ...parsed.data, tenantId: req.tenantId! } });
  return res.status(201).json(structure);
});

// ── Scholarships / waivers (gap-fix §1.E — structured, not just a field) ──
const scholarshipSchema = z.object({
  studentId: z.string().min(1),
  academicYearId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['PERCENTAGE', 'FIXED']),
  value: z.number().positive(),
  category: z.enum(FEE_CATEGORIES).optional(),
});

feesRouter.get('/scholarships', requirePermission('fees', 'read'), async (req, res) => {
  const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
  if (!studentId) return res.status(400).json({ error: 'studentId is required' });

  const scholarships = await req.db!.scholarship.findMany({ where: { studentId, isActive: true } });
  return res.json(scholarships);
});

feesRouter.post('/scholarships', requirePermission('fees', 'manage'), async (req, res) => {
  const parsed = scholarshipSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const scholarship = await req.db!.scholarship.create({ data: { ...parsed.data, tenantId: req.tenantId! } });
  return res.status(201).json(scholarship);
});

// ── Invoice generation & listing ──────────────────────────────────
function computeWaiver(amount: number, scholarships: { type: string; value: unknown; category: string | null }[], category: string): number {
  const applicable = scholarships.filter((s) => s.category === null || s.category === category);
  return applicable.reduce((total, s) => {
    const value = Number(s.value);
    const waiver = s.type === 'PERCENTAGE' ? (amount * value) / 100 : value;
    return total + waiver;
  }, 0);
}

const generateInvoicesSchema = z.object({
  feeStructureId: z.string().min(1),
  dueDate: z.coerce.date(),
  studentIds: z.array(z.string()).optional(), // omit to generate for every student in the fee structure's class/section scope
});

feesRouter.post('/invoices/generate', requirePermission('fees', 'manage'), async (req, res) => {
  const parsed = generateInvoicesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const { feeStructureId, dueDate, studentIds } = parsed.data;
  const structure = await req.db!.feeStructure.findUniqueOrThrow({ where: { id: feeStructureId } });

  const students = await req.db!.student.findMany({
    where: {
      ...(studentIds ? { id: { in: studentIds } } : {}),
      ...(structure.classId ? { classId: structure.classId } : {}),
      ...(structure.sectionId ? { sectionId: structure.sectionId } : {}),
      status: 'ACTIVE',
    },
  });

  const amount = Number(structure.amount);
  const created = [];

  for (const student of students) {
    // One invoice per student per fee structure — re-running generate is idempotent.
    const existing = await req.db!.invoice.findFirst({ where: { studentId: student.id, feeStructureId } });
    if (existing) continue;

    const scholarships = await req.db!.scholarship.findMany({ where: { studentId: student.id, isActive: true } });
    const waivedAmount = computeWaiver(amount, scholarships, structure.category);

    const invoice = await req.db!.invoice.create({
      data: {
        tenantId: req.tenantId!,
        studentId: student.id,
        feeStructureId,
        academicYearId: structure.academicYearId,
        category: structure.category,
        amountDue: amount,
        waivedAmount,
        dueDate,
      },
    });
    created.push(invoice);
  }

  return res.status(201).json({ createdCount: created.length, invoices: created });
});

// Installment plans (gap-fix, PRD §10.1): split one invoice into N smaller
// invoices with staggered due dates. Original is cancelled, not deleted.
const splitSchema = z.object({
  numberOfInstallments: z.number().int().min(2).max(12),
  firstDueDate: z.coerce.date(),
  intervalDays: z.number().int().positive().default(30),
});

feesRouter.post('/invoices/:id/split-into-installments', requirePermission('fees', 'manage'), async (req, res) => {
  const parsed = splitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const original = await req.db!.invoice.findUnique({ where: { id: req.params.id as string } });
  if (!original) return res.status(404).json({ error: 'Invoice not found' });
  if (Number(original.amountPaid) > 0) return res.status(400).json({ error: 'Cannot split an invoice that already has payments recorded' });

  const { numberOfInstallments, firstDueDate, intervalDays } = parsed.data;
  const remaining = Number(original.amountDue) - Number(original.waivedAmount);
  const perInstallment = Math.round((remaining / numberOfInstallments) * 100) / 100;

  const installments = await req.db!.$transaction([
    req.db!.invoice.update({ where: { id: original.id }, data: { status: 'CANCELLED' } }),
    ...Array.from({ length: numberOfInstallments }, (_, i) =>
      req.db!.invoice.create({
        data: {
          tenantId: req.tenantId!,
          studentId: original.studentId,
          feeStructureId: original.feeStructureId,
          academicYearId: original.academicYearId,
          category: original.category,
          amountDue: perInstallment,
          dueDate: new Date(firstDueDate.getTime() + i * intervalDays * 24 * 60 * 60 * 1000),
          parentInvoiceId: original.id,
          installmentNumber: i + 1,
        },
      }),
    ),
  ]);

  return res.status(201).json({ cancelledOriginal: original.id, installments: installments.slice(1) });
});

// Late-fee rule engine (gap-fix, PRD §10.1) — not auto-applied on a schedule
// (no cron/BullMQ yet, see ROADMAP.md), run on demand or wire to a periodic job later.
feesRouter.post('/invoices/recalculate-late-fees', requirePermission('fees', 'manage'), async (req, res) => {
  const invoices = await req.db!.invoice.findMany({
    where: { status: { in: ['PENDING', 'PARTIAL'] } },
    include: { feeStructure: true },
  });

  let updated = 0;
  for (const invoice of invoices) {
    const lateFee = computeLateFee(invoice.dueDate, invoice.feeStructure?.lateFeePerDay ? Number(invoice.feeStructure.lateFeePerDay) : null);
    const isOverdue = invoice.dueDate < new Date();
    if (lateFee !== Number(invoice.lateFeeAccrued) || (isOverdue && invoice.status === 'PENDING')) {
      await req.db!.invoice.update({
        where: { id: invoice.id },
        data: { lateFeeAccrued: lateFee, status: isOverdue && invoice.status === 'PENDING' ? 'OVERDUE' : invoice.status },
      });
      updated += 1;
    }
  }

  return res.json({ checked: invoices.length, updated });
});

const listInvoicesQuery = z.object({
  studentId: z.string().optional(),
  status: z.enum(['PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
});

feesRouter.get('/invoices', requirePermission('fees', 'read'), async (req, res) => {
  const parsed = listInvoicesQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });

  const invoices = await req.db!.invoice.findMany({
    where: { ...(parsed.data.studentId ? { studentId: parsed.data.studentId } : {}), ...(parsed.data.status ? { status: parsed.data.status } : {}) },
    include: { payments: true, student: { include: { user: { select: { name: true } } } } },
    orderBy: { dueDate: 'asc' },
  });
  return res.json(invoices);
});

feesRouter.get('/invoices/:id', requirePermission('fees', 'read'), async (req, res) => {
  const invoice = await req.db!.invoice.findUnique({
    where: { id: req.params.id as string },
    include: { payments: true, refunds: true, student: { include: { user: { select: { name: true } } } } },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  return res.json(invoice);
});

// ── Payment collection (PRD §10.2) ────────────────────────────────
const paySchema = z.object({
  gateway: z.enum(['CASH', 'BKASH', 'NAGAD', 'SSLCOMMERZ']),
  amount: z.number().positive(),
});

feesRouter.post('/invoices/:id/pay', requirePermission('fees', 'write'), async (req, res) => {
  const parsed = paySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const invoiceId = req.params.id as string;
  const invoice = await req.db!.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  let result;
  try {
    result = await getGateway(parsed.data.gateway).initiate({
      invoiceId,
      amount: parsed.data.amount,
      studentName: '',
    });
  } catch (err) {
    if (err instanceof GatewayNotConfiguredError) {
      return res.status(503).json({ error: err.message });
    }
    throw err;
  }

  const payment = await req.db!.payment.create({
    data: {
      invoiceId,
      tenantId: req.tenantId!,
      gateway: parsed.data.gateway,
      transactionId: result.transactionId,
      amount: parsed.data.amount,
      status: result.status,
      paidAt: result.status === 'SUCCESS' ? new Date() : null,
      collectedBy: parsed.data.gateway === 'CASH' ? req.user!.sub : undefined,
    },
  });

  // Outbox pattern (plan §2.2): success side-effects (invoice update, receipt, SMS)
  // are queued, not applied inline — retryable independently of this request.
  if (result.status === 'SUCCESS') {
    await req.db!.outboxEvent.create({
      data: {
        tenantId: req.tenantId!,
        eventType: 'payment.succeeded',
        payload: { invoiceId, paymentId: payment.id, amount: parsed.data.amount },
      },
    });
  }

  return res.status(201).json({ payment, redirectUrl: result.redirectUrl });
});

// ── Refund workflow (gap-fix §1.E) ────────────────────────────────
const refundRequestSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().positive(),
  reason: z.string().min(5),
});

feesRouter.post('/refunds', requirePermission('fees', 'write'), async (req, res) => {
  const parsed = refundRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const refund = await req.db!.refundRequest.create({
    data: { ...parsed.data, tenantId: req.tenantId!, requestedBy: req.user!.sub },
  });
  return res.status(201).json(refund);
});

feesRouter.get('/refunds', requirePermission('fees', 'read'), async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const refunds = await req.db!.refundRequest.findMany({
    where: status ? { status: status as never } : {},
    include: { invoice: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(refunds);
});

feesRouter.post('/refunds/:id/approve', requirePermission('fees', 'manage'), async (req, res) => {
  const refund = await req.db!.refundRequest.findUnique({ where: { id: req.params.id as string } });
  if (!refund || refund.status !== 'PENDING') return res.status(404).json({ error: 'Refund not found or already resolved' });

  const invoice = await req.db!.invoice.findUniqueOrThrow({ where: { id: refund.invoiceId } });
  const newAmountPaid = Math.max(0, Number(invoice.amountPaid) - Number(refund.amount));

  await req.db!.$transaction([
    req.db!.refundRequest.update({
      where: { id: refund.id },
      data: { status: 'APPROVED', approvedBy: req.user!.sub, resolvedAt: new Date() },
    }),
    req.db!.invoice.update({
      where: { id: invoice.id },
      data: { amountPaid: newAmountPaid, status: newAmountPaid <= 0 ? 'PENDING' : 'PARTIAL' },
    }),
  ]);

  return res.status(204).send();
});

feesRouter.post('/refunds/:id/reject', requirePermission('fees', 'manage'), async (req, res) => {
  await req.db!.refundRequest.update({
    where: { id: req.params.id as string },
    data: { status: 'REJECTED', approvedBy: req.user!.sub, resolvedAt: new Date() },
  });
  return res.status(204).send();
});

// ── Reports (PRD §10.3) ────────────────────────────────────────────
feesRouter.get('/reports/daily-collection', requirePermission('fees', 'read'), async (req, res) => {
  const dateStr = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(`${dateStr}T23:59:59.999Z`);

  const payments = await req.db!.payment.findMany({
    where: { status: 'SUCCESS', paidAt: { gte: start, lte: end } },
  });

  const byGateway: Record<string, number> = {};
  let total = 0;
  for (const p of payments) {
    const amt = Number(p.amount);
    byGateway[p.gateway] = (byGateway[p.gateway] ?? 0) + amt;
    total += amt;
  }

  return res.json({ date: dateStr, total, byGateway, count: payments.length });
});

async function getDefaulters(db: NonNullable<Express.Request['db']>, thresholdDays: number) {
  const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);

  const invoices = await db.invoice.findMany({
    where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] }, dueDate: { lt: cutoff } },
    include: { student: { include: { user: true, guardian: true } } },
    orderBy: { dueDate: 'asc' },
  });

  const byStudent = new Map<
    string,
    { studentId: string; name: string; studentUid: string; totalDue: number; invoiceCount: number; contact: string }
  >();
  for (const inv of invoices) {
    const due = Number(inv.amountDue) - Number(inv.waivedAmount) - Number(inv.amountPaid);
    const existing = byStudent.get(inv.studentId);
    if (existing) {
      existing.totalDue += due;
      existing.invoiceCount += 1;
    } else {
      byStudent.set(inv.studentId, {
        studentId: inv.studentId,
        name: inv.student.user.name,
        studentUid: inv.student.studentUid,
        totalDue: due,
        invoiceCount: 1,
        contact: inv.student.guardian?.phone ?? inv.student.user.phone ?? inv.student.user.email ?? 'unknown',
      });
    }
  }

  return Array.from(byStudent.values());
}

feesRouter.get('/reports/defaulters', requirePermission('fees', 'read'), async (req, res) => {
  const thresholdDays = req.query.thresholdDays ? Number(req.query.thresholdDays) : 0;
  const defaulters = await getDefaulters(req.db!, thresholdDays);
  return res.json(defaulters);
});

// Bulk SMS reminder to defaulters (gap-fix, PRD §10.3) — uses the same notify
// stub as everywhere else; swap for a real SMS provider once one exists.
feesRouter.post('/reports/defaulters/remind', requirePermission('fees', 'manage'), async (req, res) => {
  const thresholdDays = req.body?.thresholdDays ? Number(req.body.thresholdDays) : 0;
  const defaulters = await getDefaulters(req.db!, thresholdDays);

  for (const d of defaulters) {
    await sendOtp(d.contact, `Dear guardian, ${d.name} (${d.studentUid}) has an outstanding fee due of ${d.totalDue} BDT. Please pay at your earliest convenience.`, 'fee reminder');
  }

  return res.json({ remindersSent: defaulters.length });
});

// Excel export of the fee ledger (gap-fix, PRD §10.3).
feesRouter.get('/reports/ledger/export', requirePermission('fees', 'read'), async (req, res) => {
  const invoices = await req.db!.invoice.findMany({
    include: { student: { include: { user: true } }, payments: true },
    orderBy: { dueDate: 'asc' },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Fee Ledger');
  sheet.columns = [
    { header: 'Student ID', key: 'studentUid', width: 18 },
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Category', key: 'category', width: 14 },
    { header: 'Amount Due', key: 'amountDue', width: 14 },
    { header: 'Waived', key: 'waived', width: 12 },
    { header: 'Paid', key: 'paid', width: 12 },
    { header: 'Late Fee', key: 'lateFee', width: 12 },
    { header: 'Due Date', key: 'dueDate', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  for (const inv of invoices) {
    sheet.addRow({
      studentUid: inv.student.studentUid,
      name: inv.student.user.name,
      category: inv.category,
      amountDue: Number(inv.amountDue),
      waived: Number(inv.waivedAmount),
      paid: Number(inv.amountPaid),
      lateFee: Number(inv.lateFeeAccrued),
      dueDate: inv.dueDate.toISOString().slice(0, 10),
      status: inv.status,
    });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="fee-ledger.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});
