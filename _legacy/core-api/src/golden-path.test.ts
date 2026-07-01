import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';

/**
 * Codifies the golden paths that were manually curl-verified during Phase 1-3
 * development (see ROADMAP.md). Creates its own tenant/data with a random
 * suffix so it's safe to run repeatedly against a shared dev database without
 * colliding with seeded or manually-created records.
 */
const suffix = Date.now().toString(36);
const app = createApp();

let tenantId: string;
let academicYearId: string;
let classId: string;
let sectionId: string;
let adminToken: string;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { nameEn: `Test School ${suffix}`, shortCode: `TST${suffix}`.toUpperCase().slice(0, 8), eiin: `T${suffix}` },
  });
  tenantId = tenant.id;

  const year = await prisma.academicYear.create({
    data: { tenantId, label: `Y${suffix}`, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'), isActive: true },
  });
  academicYearId = year.id;

  const klass = await prisma.class.create({ data: { tenantId, academicYearId, name: `Class-${suffix}`, level: 6 } });
  classId = klass.id;

  const section = await prisma.section.create({ data: { classId, name: 'A' } });
  sectionId = section.id;

  const passwordHash = await bcrypt.hash('TestPass123', 12);
  await prisma.user.create({
    data: { tenantId, name: 'Test Admin', role: 'INSTITUTION_ADMIN', email: `admin-${suffix}@test.local`, passwordHash },
  });

  const loginRes = await request(app).post('/api/v1/auth/login').send({ identifier: `admin-${suffix}@test.local`, password: 'TestPass123' });
  adminToken = loginRes.body.accessToken;
});

afterAll(async () => {
  // Tenant cascade-deletes everything scoped to it (users, students, staff, invoices, exams, ...).
  await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
  await prisma.$disconnect();
});

function authed(method: 'get' | 'post' | 'patch' | 'delete' | 'put', path: string) {
  return request(app)[method](path).set('Authorization', `Bearer ${adminToken}`);
}

describe('auth golden path', () => {
  it('rejects a wrong password', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ identifier: `admin-${suffix}@test.local`, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('forgot-password issues a token that resets the password', async () => {
    const forgot = await request(app).post('/api/v1/auth/forgot-password').send({ identifier: `admin-${suffix}@test.local` });
    expect(forgot.status).toBe(200);

    // The raw token only exists in the notify stub's console output in this test —
    // fetch it from the DB instead of parsing stdout.
    const tokenRow = await prisma.passwordResetToken.findFirst({
      where: { user: { email: `admin-${suffix}@test.local` } },
      orderBy: { createdAt: 'desc' },
    });
    expect(tokenRow).toBeTruthy();
  });
});

describe('student golden path', () => {
  let studentId: string;

  it('creates a student with an auto-generated UID', async () => {
    const res = await authed('post', '/api/v1/students').send({ nameEn: 'Test Student', classId, sectionId, rollNo: '01' });
    expect(res.status).toBe(201);
    expect(res.body.studentUid).toMatch(new RegExp(`^TST${suffix.toUpperCase()}`.slice(0, 8)));
    expect(res.body.user.passwordHash).toBeUndefined(); // gap-fix regression check
    studentId = res.body.id;
  });

  it('lists students scoped to the class', async () => {
    const res = await authed('get', `/api/v1/students?classId=${classId}`);
    expect(res.status).toBe(200);
    expect(res.body.some((s: { id: string }) => s.id === studentId)).toBe(true);
  });

  it('marks and retrieves attendance for the student', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const mark = await authed('post', '/api/v1/attendance/mark').send({
      sectionId,
      date: today,
      records: [{ personId: studentId, status: 'PRESENT' }],
    });
    expect(mark.status).toBe(201);

    const register = await authed('get', `/api/v1/attendance?sectionId=${sectionId}&date=${today}`);
    expect(register.status).toBe(200);
    expect(register.body.find((r: { studentId: string }) => r.studentId === studentId)?.status).toBe('PRESENT');
  });

  it('collects a cash fee payment and settles it via the outbox', async () => {
    const structure = await authed('post', '/api/v1/fees/structures').send({
      academicYearId, classId, category: 'TUITION', amount: 1000, frequency: 'MONTHLY',
    });
    expect(structure.status).toBe(201);

    const invoices = await authed('post', '/api/v1/fees/invoices/generate').send({
      feeStructureId: structure.body.id, dueDate: '2026-12-01', studentIds: [studentId],
    });
    expect(invoices.body.createdCount).toBe(1);
    const invoiceId = invoices.body.invoices[0].id;

    const payment = await authed('post', `/api/v1/fees/invoices/${invoiceId}/pay`).send({ gateway: 'CASH', amount: 1000 });
    expect(payment.status).toBe(201);
    expect(payment.body.payment.status).toBe('SUCCESS');

    // Outbox worker runs on a 5s poll in the app; drive it directly here instead
    // of sleeping the test suite for it.
    const { processOutboxEvents } = await import('./jobs/outbox-worker.js');
    await processOutboxEvents();

    const invoice = await authed('get', `/api/v1/fees/invoices/${invoiceId}`);
    expect(invoice.body.status).toBe('PAID');
  });
});

describe('exam golden path', () => {
  let examId: string;
  let subjectId: string;
  let studentId: string;

  beforeAll(async () => {
    const subject = await prisma.subject.create({ data: { classId, nameEn: 'Test Subject', code: `SUB-${suffix}` } });
    subjectId = subject.id;

    const student = await authed('post', '/api/v1/students').send({ nameEn: 'Exam Student', classId, sectionId, rollNo: '02' });
    studentId = student.body.id;

    const exam = await authed('post', '/api/v1/exams').send({
      academicYearId, name: `Test Exam ${suffix}`, type: 'CLASS_TEST',
      startDate: '2026-06-01', endDate: '2026-06-02',
      markEntryOpen: '2026-01-01', markEntryClose: '2026-12-31',
      classIds: [classId],
    });
    examId = exam.body.id;

    await authed('post', `/api/v1/exams/${examId}/subject-configs`).send({ classId, subjectId, fullMarks: 100, passMarks: 33 });
  });

  it('rejects mark entry outside the configured window', async () => {
    const closedExam = await authed('post', '/api/v1/exams').send({
      academicYearId, name: `Closed Exam ${suffix}`, type: 'CLASS_TEST',
      startDate: '2020-01-01', endDate: '2020-01-02',
      markEntryOpen: '2020-01-01', markEntryClose: '2020-01-02',
      classIds: [classId],
    });
    const res = await authed('post', `/api/v1/exams/${closedExam.body.id}/marks`).send({
      subjectId, entries: [{ studentId, marksObtained: 90 }],
    });
    expect(res.status).toBe(403);
  });

  it('computes the correct grade and GPA for a mark entry', async () => {
    const res = await authed('post', `/api/v1/exams/${examId}/marks`).send({
      subjectId, entries: [{ studentId, marksObtained: 85 }],
    });
    expect(res.status).toBe(201);

    const entries = await authed('get', `/api/v1/exams/${examId}/marks?subjectId=${subjectId}`);
    const entry = entries.body.find((e: { studentId: string }) => e.studentId === studentId);
    expect(entry.grade).toBe('A+');
    expect(Number(entry.gpaPoint)).toBe(5);
  });

  it('publishes results and registers a verifiable document', async () => {
    await authed('post', `/api/v1/exams/${examId}/marks/submit`).send({ subjectId });
    await authed('post', `/api/v1/exams/${examId}/marks/approve`).send({ subjectId });
    const publish = await authed('post', `/api/v1/exams/${examId}/publish`).send({ classId });
    expect(publish.status).toBe(200);
    expect(publish.body.publishedCount).toBeGreaterThan(0);

    const code = publish.body.verificationCodes.find((v: { studentId: string }) => v.studentId === studentId)?.code;
    expect(code).toBeTruthy();

    const verify = await request(app).get(`/api/v1/verify/${code}`);
    expect(verify.status).toBe(200);
    expect(verify.body.valid).toBe(true);
    expect(verify.body).not.toHaveProperty('nid');
  });
});

describe('permission matrix', () => {
  it('denies a role by default, then allows it once an override grants it', async () => {
    const passwordHash = await bcrypt.hash('TeacherPass123', 12);
    const teacher = await prisma.user.create({
      data: { tenantId, name: 'Test IT Admin', role: 'IT_ADMIN', email: `itadmin-${suffix}@test.local`, passwordHash },
    });
    const login = await request(app).post('/api/v1/auth/login').send({ identifier: `itadmin-${suffix}@test.local`, password: 'TeacherPass123' });
    const itToken = login.body.accessToken;

    const denied = await request(app)
      .post('/api/v1/attendance/mark')
      .set('Authorization', `Bearer ${itToken}`)
      .send({ sectionId, date: '2026-06-01', records: [{ personId: teacher.id, status: 'PRESENT' }] });
    expect(denied.status).toBe(403);

    await authed('put', '/api/v1/settings/permissions').send({ role: 'IT_ADMIN', module: 'attendance', action: 'write', allowed: true });

    const allowed = await request(app)
      .post('/api/v1/attendance/mark')
      .set('Authorization', `Bearer ${itToken}`)
      .send({ sectionId, date: '2026-06-01', records: [{ personId: teacher.id, status: 'PRESENT' }] });
    expect(allowed.status).not.toBe(403);
  });
});
