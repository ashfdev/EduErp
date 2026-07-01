import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/permission.js';

export const staffRouter = Router();

staffRouter.use(requireAuth, requireTenant);

async function generateStaffUid(db: NonNullable<Express.Request['db']>, shortCode: string) {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await db.staff.count({ where: { staffUid: { startsWith: `${shortCode}-STF-${year}-` } } });
    const seq = String(count + 1 + attempt).padStart(4, '0');
    const candidate = `${shortCode}-STF-${year}-${seq}`;
    const exists = await db.staff.findFirst({ where: { staffUid: candidate } });
    if (!exists) return candidate;
  }
  throw new Error('Could not generate a unique staff UID after 5 attempts');
}

const roleEnum = z.enum([
  'INSTITUTION_ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'EXAM_CONTROLLER', 'HEAD_OF_DEPARTMENT',
  'CLASS_TEACHER', 'SUBJECT_TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'TRANSPORT_MANAGER',
  'HOSTEL_MANAGER', 'IT_ADMIN',
]);

const createStaffSchema = z.object({
  nameEn: z.string().min(1),
  role: roleEnum,
  designation: z.string().min(1),
  departmentId: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  employmentType: z.enum(['PERMANENT', 'CONTRACT', 'PART_TIME']).default('PERMANENT'),
  joiningDate: z.coerce.date().optional(),
  password: z.string().min(8).default('changeme123'),
});

staffRouter.post('/', requirePermission('staff', 'write'), async (req, res) => {
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const tenantId = req.tenantId!;
  const tenant = await req.db!.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const staffUid = await generateStaffUid(req.db!, tenant.shortCode);
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const { nameEn, role, email, phone, password: _password, ...staffFields } = parsed.data;
  void _password;

  const staff = await req.db!.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name: nameEn, role, email, phone, passwordHash, tenantId } });
    return tx.staff.create({
      data: { ...staffFields, userId: user.id, staffUid, tenantId },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, role: true, status: true } },
        department: true,
      },
    });
  });

  await req.db!.auditLog.create({
    data: { userId: req.user!.sub, tenantId, action: 'staff.create', entityType: 'Staff', entityId: staff.id },
  });

  return res.status(201).json(staff);
});

staffRouter.get('/', requirePermission('staff', 'read'), async (req, res) => {
  const departmentId = typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined;
  const staff = await req.db!.staff.findMany({
    where: departmentId ? { departmentId } : {},
    include: { user: { select: { name: true, role: true, email: true, phone: true, status: true } }, department: true },
    orderBy: { staffUid: 'asc' },
  });
  res.json(staff);
});

staffRouter.get('/:id', requirePermission('staff', 'read'), async (req, res) => {
  const staff = await req.db!.staff.findUnique({
    where: { id: req.params.id as string },
    include: {
      user: { select: { name: true, role: true, email: true, phone: true, status: true } },
      department: true,
      assignments: { include: { subject: true, section: { include: { class: true } }, academicYear: true } },
    },
  });
  if (!staff) return res.status(404).json({ error: 'Staff not found' });
  return res.json(staff);
});

// Gap-fix: staff previously had no update endpoint at all (photo, signature, department).
const updateStaffSchema = z.object({
  nameEn: z.string().min(1).optional(),
  designation: z.string().min(1).optional(),
  departmentId: z.string().optional(),
  photoUrl: z.string().url().optional(),
  signatureUrl: z.string().url().optional(),
  employmentType: z.enum(['PERMANENT', 'CONTRACT', 'PART_TIME']).optional(),
  showOnWebsite: z.boolean().optional(),
  qualification: z.string().optional(),
});

staffRouter.patch('/:id', requirePermission('staff', 'write'), async (req, res) => {
  const parsed = updateStaffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const { nameEn, ...staffFields } = parsed.data;
  const staff = await req.db!.staff.update({ where: { id: req.params.id as string }, data: staffFields });

  if (nameEn) {
    await req.db!.user.update({ where: { id: staff.userId }, data: { name: nameEn } });
  }

  return res.json(staff);
});

// Subject & class assignment — drives timetable, mark-entry permission, and student-portal
// visibility (PRD §11.2). Academic-year scoped, reconfigured every year.
const assignmentSchema = z.object({
  subjectId: z.string().min(1),
  sectionId: z.string().min(1),
  academicYearId: z.string().min(1),
});

staffRouter.post('/:id/assignments', requirePermission('staff', 'manage'), async (req, res) => {
  const parsed = assignmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const classRow = await req.db!.section.findUniqueOrThrow({ where: { id: parsed.data.sectionId } });

  const assignment = await req.db!.subjectTeacherAssignment.create({
    data: { ...parsed.data, staffId: req.params.id as string, classId: classRow.classId },
  });

  return res.status(201).json(assignment);
});

staffRouter.delete('/:staffId/assignments/:assignmentId', requirePermission('staff', 'manage'), async (req, res) => {
  await req.db!.subjectTeacherAssignment.delete({ where: { id: req.params.assignmentId as string } });
  res.status(204).send();
});
