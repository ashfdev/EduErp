import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/permission.js';
import { MODULES, ACTIONS } from '../lib/permissions.js';

export const settingsRouter = Router();

settingsRouter.use(requireAuth, requireTenant);

// ── Institution profile (PRD §12.1) ──────────────────────────────
settingsRouter.get('/tenant', async (req, res) => {
  const tenant = await req.db!.tenant.findUnique({ where: { id: req.tenantId } });
  res.json(tenant);
});

const updateTenantSchema = z.object({
  nameEn: z.string().min(1).optional(),
  nameBn: z.string().optional(),
  eiin: z.string().optional(),
  board: z.string().optional(),
  logoUrl: z.string().url().optional(),
  usesHijriCalendar: z.boolean().optional(),
  // Grading scale (PRD §12.2) — read by the Phase 3 grading engine (lib/grading.ts).
  gradingScale: z.enum(['BD_BOARD', 'CGPA_4', 'CUSTOM']).optional(),
});

settingsRouter.patch(
  '/tenant',
  requirePermission('settings', 'manage'),
  async (req, res) => {
    const parsed = updateTenantSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

    const tenant = await req.db!.tenant.update({ where: { id: req.tenantId! }, data: parsed.data });
    return res.json(tenant);
  },
);

// ── Academic Years (PRD §12.2) ───────────────────────────────────
const academicYearSchema = z.object({
  label: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

settingsRouter.get('/academic-years', async (req, res) => {
  const years = await req.db!.academicYear.findMany({ orderBy: { startDate: 'desc' } });
  res.json(years);
});

settingsRouter.post(
  '/academic-years',
  requirePermission('settings', 'manage'),
  async (req, res) => {
    const parsed = academicYearSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

    const year = await req.db!.academicYear.create({ data: { ...parsed.data, tenantId: req.tenantId! } });
    return res.status(201).json(year);
  },
);

settingsRouter.post(
  '/academic-years/:id/activate',
  requirePermission('settings', 'manage'),
  async (req, res) => {
    // Only one active academic year per tenant at a time.
    await req.db!.$transaction([
      req.db!.academicYear.updateMany({ data: { isActive: false } }),
      req.db!.academicYear.update({ where: { id: (req.params.id as string) }, data: { isActive: true } }),
    ]);
    return res.status(204).send();
  },
);

// ── Shifts (PRD §12.2) ────────────────────────────────────────────
const shiftSchema = z.object({
  name: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

settingsRouter.get('/shifts', async (req, res) => {
  res.json(await req.db!.shift.findMany());
});

settingsRouter.post('/shifts', requirePermission('settings', 'manage'), async (req, res) => {
  const parsed = shiftSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const shift = await req.db!.shift.create({ data: { ...parsed.data, tenantId: req.tenantId! } });
  return res.status(201).json(shift);
});

// ── Holiday calendar (PRD §12.2 — excluded from attendance calc) ─
const holidaySchema = z.object({
  date: z.coerce.date(),
  name: z.string().min(1),
  isNationalHoliday: z.boolean().optional(),
});

settingsRouter.get('/holidays', async (req, res) => {
  res.json(await req.db!.holiday.findMany({ orderBy: { date: 'asc' } }));
});

settingsRouter.post('/holidays', requirePermission('settings', 'manage'), async (req, res) => {
  const parsed = holidaySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const holiday = await req.db!.holiday.create({ data: { ...parsed.data, tenantId: req.tenantId! } });
  return res.status(201).json(holiday);
});

settingsRouter.delete('/holidays/:id', requirePermission('settings', 'manage'), async (req, res) => {
  await req.db!.holiday.delete({ where: { id: (req.params.id as string) } });
  res.status(204).send();
});

// ── User & role management (PRD §12.7) ────────────────────────────
const createUserSchema = z.object({
  name: z.string().min(1),
  role: z.enum([
    'INSTITUTION_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'EXAM_CONTROLLER', 'HEAD_OF_DEPARTMENT',
    'CLASS_TEACHER', 'SUBJECT_TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_MANAGER',
    'HOSTEL_MANAGER', 'IT_ADMIN',
  ]),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  password: z.string().min(8),
});

settingsRouter.get('/users', requirePermission('settings', 'manage'), async (req, res) => {
  const users = await req.db!.user.findMany({
    select: { id: true, name: true, role: true, email: true, phone: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(users);
});

settingsRouter.post('/users', requirePermission('settings', 'manage'), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const { password, ...rest } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await req.db!.user.create({
    data: { ...rest, passwordHash, tenantId: req.tenantId! },
    select: { id: true, name: true, role: true, email: true, phone: true, status: true },
  });

  await req.db!.auditLog.create({
    data: { userId: req.user!.sub, tenantId: req.tenantId, action: 'user.create', entityType: 'User', entityId: user.id },
  });

  return res.status(201).json(user);
});

settingsRouter.patch('/users/:id/status', requirePermission('settings', 'manage'), async (req, res) => {
  const status = z.enum(['ACTIVE', 'DISABLED']).safeParse(req.body?.status);
  if (!status.success) return res.status(400).json({ error: 'status must be ACTIVE or DISABLED' });

  const user = await req.db!.user.update({ where: { id: (req.params.id as string) }, data: { status: status.data } });

  await req.db!.auditLog.create({
    data: { userId: req.user!.sub, tenantId: req.tenantId, action: `user.${status.data.toLowerCase()}`, entityType: 'User', entityId: user.id },
  });

  return res.json({ id: user.id, status: user.status });
});

settingsRouter.post('/users/:id/reset-password', requirePermission('settings', 'manage'), async (req, res) => {
  const parsed = z.object({ newPassword: z.string().min(8) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'newPassword (min 8 chars) required' });

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await req.db!.user.update({ where: { id: (req.params.id as string) }, data: { passwordHash } });
  await req.db!.session.updateMany({ where: { userId: (req.params.id as string), revokedAt: null }, data: { revokedAt: new Date() } });

  await req.db!.auditLog.create({
    data: { userId: req.user!.sub, tenantId: req.tenantId, action: 'user.reset_password', entityType: 'User', entityId: (req.params.id as string) },
  });

  return res.status(204).send();
});

// ── Audit log viewer (PRD §12.7) ──────────────────────────────────
settingsRouter.get('/audit-logs', requirePermission('settings', 'manage'), async (req, res) => {
  const logs = await req.db!.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json(logs);
});

// ── Permission matrix (gap-fix: DB-backed overrides on top of PRD §3 defaults) ──
settingsRouter.get('/permissions', requirePermission('settings', 'manage'), async (req, res) => {
  const overrides = await req.db!.rolePermission.findMany();
  res.json({ modules: MODULES, actions: ACTIONS, overrides });
});

const permissionOverrideSchema = z.object({
  role: z.enum([
    'INSTITUTION_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'EXAM_CONTROLLER', 'HEAD_OF_DEPARTMENT',
    'CLASS_TEACHER', 'SUBJECT_TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_MANAGER',
    'HOSTEL_MANAGER', 'IT_ADMIN', 'STUDENT', 'GUARDIAN',
  ]),
  module: z.enum(MODULES),
  action: z.enum(ACTIONS),
  allowed: z.boolean(),
});

settingsRouter.put('/permissions', requirePermission('settings', 'manage'), async (req, res) => {
  const parsed = permissionOverrideSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const { role, module, action, allowed } = parsed.data;
  const tenantId = req.tenantId!;

  const override = await req.db!.rolePermission.upsert({
    where: { tenantId_role_module_action: { tenantId, role, module, action } },
    create: { tenantId, role, module, action, allowed },
    update: { allowed },
  });

  await req.db!.auditLog.create({
    data: { userId: req.user!.sub, tenantId, action: 'permission.override', metadata: { role, module, action, allowed } },
  });

  return res.status(200).json(override);
});
