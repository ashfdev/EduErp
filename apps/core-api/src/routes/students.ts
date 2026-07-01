import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/permission.js';

export const studentsRouter = Router();

studentsRouter.use(requireAuth, requireTenant);

async function generateStudentUid(db: NonNullable<Express.Request['db']>, shortCode: string) {
  const year = new Date().getFullYear();
  // Small retry loop rather than a DB sequence — acceptable at pilot scale (PRD §5.9),
  // revisit with a dedicated counter table if concurrent admission volume grows.
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await db.student.count({ where: { studentUid: { startsWith: `${shortCode}-${year}-` } } });
    const seq = String(count + 1 + attempt).padStart(5, '0');
    const candidate = `${shortCode}-${year}-${seq}`;
    const exists = await db.student.findFirst({ where: { studentUid: candidate } });
    if (!exists) return candidate;
  }
  throw new Error('Could not generate a unique student UID after 5 attempts');
}

const createStudentSchema = z.object({
  nameEn: z.string().min(1),
  nameBn: z.string().optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.string().optional(),
  bloodGroup: z.string().optional(),
  classId: z.string().optional(),
  sectionId: z.string().optional(),
  rollNo: z.string().optional(),
  photoUrl: z.string().url().optional(),
  // Health record (PRD §5.1 special-needs/accessibility + gap-fix health fields)
  chronicConditions: z.string().optional(),
  emergencyContact: z.string().optional(),
  vaccinationJson: z.record(z.string(), z.unknown()).optional(),
  password: z.string().min(8).default('changeme123'),
  guardian: z
    .object({
      name: z.string().min(1),
      relation: z.string().min(1),
      phone: z.string().optional(),
      nid: z.string().optional(),
      email: z.string().email().optional(),
      address: z.string().optional(),
    })
    .optional(),
});

studentsRouter.post('/', requirePermission('students', 'write'), async (req, res) => {
  const parsed = createStudentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const tenantId = req.tenantId!;
  const tenant = await req.db!.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const studentUid = await generateStudentUid(req.db!, tenant.shortCode);
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const { nameEn, password: _password, guardian, ...studentFields } = parsed.data;
  void _password;

  const student = await req.db!.$transaction(async (tx) => {
    const guardianRecord = guardian ? await tx.guardian.create({ data: guardian }) : null;

    const user = await tx.user.create({
      data: { name: nameEn, role: 'STUDENT', passwordHash, langPreference: 'bn', tenantId },
    });

    return tx.student.create({
      data: {
        ...studentFields,
        userId: user.id,
        studentUid,
        guardianId: guardianRecord?.id,
        tenantId,
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, role: true, status: true } },
        guardian: true,
        section: true,
      },
    });
  });

  await req.db!.auditLog.create({
    data: { userId: req.user!.sub, tenantId, action: 'student.create', entityType: 'Student', entityId: student.id },
  });

  return res.status(201).json(student);
});

const STUDENT_STATUSES = ['ACTIVE', 'PROMOTED', 'TRANSFERRED', 'GRADUATED', 'DROPPED_OUT'] as const;
const listQuerySchema = z.object({
  classId: z.string().optional(),
  sectionId: z.string().optional(),
  status: z.enum(STUDENT_STATUSES).optional(),
});

studentsRouter.get('/', requirePermission('students', 'read'), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
  const { classId, sectionId, status } = parsed.data;

  const students = await req.db!.student.findMany({
    where: {
      ...(classId ? { classId } : {}),
      ...(sectionId ? { sectionId } : {}),
      ...(status ? { status } : {}),
    },
    include: { user: { select: { name: true, phone: true, email: true } }, section: true },
    orderBy: { studentUid: 'asc' },
  });

  return res.json(students);
});

// Student 360° profile — everything in one place, organized for tab rendering (PRD §5).
studentsRouter.get('/:id', requirePermission('students', 'read'), async (req, res) => {
  const student = await req.db!.student.findUnique({
    where: { id: req.params.id as string },
    include: {
      user: { select: { name: true, email: true, phone: true, langPreference: true } },
      guardian: true,
      section: { include: { class: true, shift: true } },
      academicHistories: { include: { academicYear: true, section: { include: { class: true } } }, orderBy: { createdAt: 'desc' } },
    },
  });

  if (!student) return res.status(404).json({ error: 'Student not found' });
  return res.json(student);
});

const updateStudentSchema = createStudentSchema.partial().omit({ password: true, guardian: true });

studentsRouter.patch('/:id', requirePermission('students', 'write'), async (req, res) => {
  const parsed = updateStudentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const { nameEn, ...studentFields } = parsed.data;

  const student = await req.db!.student.update({
    where: { id: req.params.id as string },
    data: studentFields,
  });

  if (nameEn) {
    await req.db!.user.update({ where: { id: student.userId }, data: { name: nameEn } });
  }

  return res.json(student);
});

// Promotion workflow: log to StudentAcademicHistory, then move class/section (PRD §5.2).
const promoteSchema = z.object({
  academicYearId: z.string().min(1),
  toClassId: z.string().min(1),
  toSectionId: z.string().min(1),
  rollNo: z.string().optional(),
  status: z.enum(['promoted', 'failed', 'transferred']).default('promoted'),
});

studentsRouter.post('/:id/promote', requirePermission('students', 'manage'), async (req, res) => {
  const parsed = promoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const studentId = req.params.id as string;
  const { academicYearId, toClassId, toSectionId, rollNo, status } = parsed.data;

  const [history, student] = await req.db!.$transaction([
    req.db!.studentAcademicHistory.create({
      data: { studentId, academicYearId, sectionId: toSectionId, classId: toClassId, rollNo, status, promotedBy: req.user!.sub },
    }),
    req.db!.student.update({
      where: { id: studentId },
      data: { classId: toClassId, sectionId: toSectionId, rollNo, status: status === 'promoted' ? 'PROMOTED' : status === 'transferred' ? 'TRANSFERRED' : 'ACTIVE' },
    }),
  ]);

  await req.db!.auditLog.create({
    data: { userId: req.user!.sub, tenantId: req.tenantId, action: 'student.promote', entityType: 'Student', entityId: studentId, metadata: { historyId: history.id } },
  });

  return res.json({ history, student });
});
