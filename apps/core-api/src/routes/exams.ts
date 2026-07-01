import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/permission.js';
import { computeSubjectGrade, computeOverallResult, type GradingScaleName } from '../lib/grading.js';
import { buildDocumentRegistration } from '../lib/documentRegistry.js';
import { renderHtmlToPdf } from '../lib/pdf/render.js';
import { buildMarksheetHtml } from '../lib/pdf/templates/marksheet.js';
import { buildTabulationHtml, type TabulationRow } from '../lib/pdf/templates/tabulation.js';
import { generateQrDataUrl } from '../lib/qr.js';

const VERIFY_BASE_URL = process.env.PUBLIC_VERIFY_BASE_URL ?? 'http://localhost:4000/api/v1/verify';

export const examsRouter = Router();

examsRouter.use(requireAuth, requireTenant);

const EXAM_TYPES = ['CLASS_TEST', 'HALF_YEARLY', 'ANNUAL', 'TERM_FINAL', 'SEMESTER_FINAL', 'BOARD_REGISTRATION', 'TRIAL'] as const;

// ── Exam setup (PRD §7.1) ─────────────────────────────────────────
const createExamSchema = z.object({
  academicYearId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(EXAM_TYPES),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  markEntryOpen: z.coerce.date(),
  markEntryClose: z.coerce.date(),
  has4thSubjectRule: z.boolean().optional(),
  classIds: z.array(z.string()).min(1),
});

examsRouter.post('/', requirePermission('exams', 'manage'), async (req, res) => {
  const parsed = createExamSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const { classIds, ...examFields } = parsed.data;
  const tenantId = req.tenantId!;

  const exam = await req.db!.exam.create({
    data: {
      ...examFields,
      tenantId,
      classes: { create: classIds.map((classId) => ({ classId })) },
    },
    include: { classes: true },
  });

  return res.status(201).json(exam);
});

examsRouter.get('/', requirePermission('exams', 'read'), async (req, res) => {
  const academicYearId = typeof req.query.academicYearId === 'string' ? req.query.academicYearId : undefined;
  const exams = await req.db!.exam.findMany({
    where: academicYearId ? { academicYearId } : {},
    include: { classes: true },
    orderBy: { startDate: 'desc' },
  });
  res.json(exams);
});

examsRouter.get('/:id', requirePermission('exams', 'read'), async (req, res) => {
  const exam = await req.db!.exam.findUnique({
    where: { id: req.params.id as string },
    include: { classes: true, subjectConfigs: true },
  });
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  return res.json(exam);
});

const subjectConfigSchema = z.object({
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  fullMarks: z.number().int().positive(),
  passMarks: z.number().int().nonnegative(),
  isFourthSubject: z.boolean().optional(),
});

examsRouter.post('/:id/subject-configs', requirePermission('exams', 'manage'), async (req, res) => {
  const parsed = subjectConfigSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const config = await req.db!.examSubjectConfig.create({ data: { ...parsed.data, examId: req.params.id as string } });
  return res.status(201).json(config);
});

examsRouter.get('/:id/subject-configs', requirePermission('exams', 'read'), async (req, res) => {
  const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
  const configs = await req.db!.examSubjectConfig.findMany({
    where: { examId: req.params.id as string, ...(classId ? { classId } : {}) },
  });
  res.json(configs);
});

// ── Seat plan (PRD §7.1) ───────────────────────────────────────────
const seatPlanSchema = z.object({
  entries: z.array(z.object({ studentId: z.string(), hall: z.string(), seatNo: z.string(), invigilatorId: z.string().optional() })).min(1),
});

examsRouter.post('/:id/seat-plan', requirePermission('exams', 'manage'), async (req, res) => {
  const parsed = seatPlanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const examId = req.params.id as string;
  const results = await req.db!.$transaction(
    parsed.data.entries.map((e) =>
      req.db!.examSeatPlan.upsert({
        where: { examId_studentId: { examId, studentId: e.studentId } },
        create: { examId, ...e },
        update: { hall: e.hall, seatNo: e.seatNo, invigilatorId: e.invigilatorId },
      }),
    ),
  );
  return res.status(201).json({ count: results.length });
});

// ── Mark entry & moderation (PRD §7.2) ─────────────────────────────
const markEntrySchema = z.object({
  subjectId: z.string().min(1),
  entries: z.array(z.object({ studentId: z.string(), marksObtained: z.number().nonnegative().optional(), isAbsent: z.boolean().default(false) })).min(1),
});

examsRouter.post('/:id/marks', requirePermission('exams', 'write'), async (req, res) => {
  const parsed = markEntrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const examId = req.params.id as string;
  const exam = await req.db!.exam.findUniqueOrThrow({ where: { id: examId } });
  const now = new Date();
  if (now < exam.markEntryOpen || now > exam.markEntryClose) {
    return res.status(403).json({ error: 'Mark entry window is closed for this exam' });
  }

  const tenant = await req.db!.tenant.findUniqueOrThrow({ where: { id: req.tenantId! } });
  const student0 = await req.db!.student.findUniqueOrThrow({ where: { id: parsed.data.entries[0]!.studentId } });
  const config = await req.db!.examSubjectConfig.findFirstOrThrow({
    where: { examId, subjectId: parsed.data.subjectId, classId: student0.classId ?? undefined },
  });

  const results = await req.db!.$transaction(
    parsed.data.entries.map((e) => {
      const grade = e.isAbsent || e.marksObtained === undefined
        ? { letter: 'Ab', gpaPoint: 0 }
        : computeSubjectGrade(e.marksObtained, config.fullMarks, tenant.gradingScale as GradingScaleName);

      return req.db!.markEntry.upsert({
        where: { examId_studentId_subjectId_attemptNumber: { examId, studentId: e.studentId, subjectId: parsed.data.subjectId, attemptNumber: 1 } },
        create: {
          tenantId: req.tenantId!,
          examId,
          studentId: e.studentId,
          subjectId: parsed.data.subjectId,
          marksObtained: e.isAbsent ? null : e.marksObtained,
          isAbsent: e.isAbsent,
          grade: grade.letter,
          gpaPoint: grade.gpaPoint,
          status: 'DRAFT',
          enteredBy: req.user!.sub,
        },
        update: {
          marksObtained: e.isAbsent ? null : e.marksObtained,
          isAbsent: e.isAbsent,
          grade: grade.letter,
          gpaPoint: grade.gpaPoint,
          status: 'DRAFT',
          enteredBy: req.user!.sub,
        },
      });
    }),
  );

  return res.status(201).json({ count: results.length });
});

examsRouter.get('/:id/marks', requirePermission('exams', 'read'), async (req, res) => {
  const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined;
  const entries = await req.db!.markEntry.findMany({
    where: { examId: req.params.id as string, ...(subjectId ? { subjectId } : {}), attemptNumber: 1 },
  });
  res.json(entries);
});

const subjectOnlySchema = z.object({ subjectId: z.string().min(1) });

examsRouter.post('/:id/marks/submit', requirePermission('exams', 'write'), async (req, res) => {
  const parsed = subjectOnlySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'subjectId is required' });

  const result = await req.db!.markEntry.updateMany({
    where: { examId: req.params.id as string, subjectId: parsed.data.subjectId, status: 'DRAFT' },
    data: { status: 'SUBMITTED' },
  });
  return res.json({ updated: result.count });
});

examsRouter.post('/:id/marks/approve', requirePermission('exams', 'manage'), async (req, res) => {
  const parsed = subjectOnlySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'subjectId is required' });

  const result = await req.db!.markEntry.updateMany({
    where: { examId: req.params.id as string, subjectId: parsed.data.subjectId, status: 'SUBMITTED' },
    data: { status: 'APPROVED', approvedBy: req.user!.sub, approvedAt: new Date() },
  });
  return res.json({ updated: result.count });
});

// Retake/improvement exam attempt (gap-fix, §1.D) — new attempt row, doesn't touch attempt 1.
const retakeSchema = z.object({ studentId: z.string().min(1), subjectId: z.string().min(1) });

examsRouter.post('/:id/marks/retake', requirePermission('exams', 'manage'), async (req, res) => {
  const parsed = retakeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const examId = req.params.id as string;
  const latest = await req.db!.markEntry.findFirst({
    where: { examId, studentId: parsed.data.studentId, subjectId: parsed.data.subjectId },
    orderBy: { attemptNumber: 'desc' },
  });

  const entry = await req.db!.markEntry.create({
    data: {
      tenantId: req.tenantId!,
      examId,
      studentId: parsed.data.studentId,
      subjectId: parsed.data.subjectId,
      attemptNumber: (latest?.attemptNumber ?? 0) + 1,
      status: 'DRAFT',
      enteredBy: req.user!.sub,
    },
  });
  return res.status(201).json(entry);
});

// ── Marks re-check / remark workflow (gap-fix, §1.D) ──────────────
const remarkRequestSchema = z.object({ reason: z.string().min(5) });

examsRouter.post('/marks/:markEntryId/remark-request', requirePermission('exams', 'write'), async (req, res) => {
  const parsed = remarkRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'reason (min 5 chars) is required' });

  const markEntry = await req.db!.markEntry.findUniqueOrThrow({ where: { id: req.params.markEntryId as string } });

  const request = await req.db!.remarkRequest.create({
    data: {
      tenantId: req.tenantId!,
      markEntryId: markEntry.id,
      requestedBy: req.user!.sub,
      reason: parsed.data.reason,
      originalMarks: markEntry.marksObtained,
    },
  });
  return res.status(201).json(request);
});

const reviewRemarkSchema = z.object({ status: z.enum(['ADJUSTED', 'REJECTED']), adjustedMarks: z.number().nonnegative().optional() });

examsRouter.post('/remark-requests/:id/review', requirePermission('exams', 'manage'), async (req, res) => {
  const parsed = reviewRemarkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const remark = await req.db!.remarkRequest.findUniqueOrThrow({ where: { id: req.params.id as string } });

  await req.db!.$transaction(async (tx) => {
    await tx.remarkRequest.update({
      where: { id: remark.id },
      data: { status: parsed.data.status, adjustedMarks: parsed.data.adjustedMarks, reviewedBy: req.user!.sub, reviewedAt: new Date() },
    });

    if (parsed.data.status === 'ADJUSTED' && parsed.data.adjustedMarks !== undefined) {
      const markEntry = await tx.markEntry.findUniqueOrThrow({ where: { id: remark.markEntryId } });
      const exam = await tx.exam.findUniqueOrThrow({ where: { id: markEntry.examId } });
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: req.tenantId! } });
      const config = await tx.examSubjectConfig.findFirstOrThrow({ where: { examId: exam.id, subjectId: markEntry.subjectId } });
      const grade = computeSubjectGrade(parsed.data.adjustedMarks!, config.fullMarks, tenant.gradingScale as GradingScaleName);

      await tx.markEntry.update({
        where: { id: markEntry.id },
        data: { marksObtained: parsed.data.adjustedMarks, grade: grade.letter, gpaPoint: grade.gpaPoint },
      });
    }
  });

  return res.status(204).send();
});

// ── Result publish & ranking (PRD §7.3, §7.4) ─────────────────────
const publishSchema = z.object({ classId: z.string().min(1) });

examsRouter.post('/:id/publish', requirePermission('exams', 'manage'), async (req, res) => {
  const parsed = publishSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'classId is required' });

  const examId = req.params.id as string;
  const { classId } = parsed.data;
  const exam = await req.db!.exam.findUniqueOrThrow({ where: { id: examId } });
  const tenant = await req.db!.tenant.findUniqueOrThrow({ where: { id: req.tenantId! } });

  const students = await req.db!.student.findMany({ where: { classId, status: 'ACTIVE' } });
  const configs = await req.db!.examSubjectConfig.findMany({ where: { examId, classId } });

  const computed: { studentId: string; sectionId: string; totalMarks: number; gpa: number; letterGrade: string; hasFailed: boolean }[] = [];

  for (const student of students) {
    const entries = await req.db!.markEntry.findMany({
      where: { examId, studentId: student.id, status: 'APPROVED', attemptNumber: 1 },
    });
    if (entries.length === 0 || !student.sectionId) continue;

    const totalMarks = entries.reduce((sum, e) => sum + Number(e.marksObtained ?? 0), 0);
    const subjectInputs = entries.map((e) => ({
      gpaPoint: Number(e.gpaPoint ?? 0),
      isFourthSubject: configs.find((c) => c.subjectId === e.subjectId)?.isFourthSubject ?? false,
      isAbsent: e.isAbsent,
    }));
    const overall = computeOverallResult(subjectInputs, tenant.gradingScale as GradingScaleName, exam.has4thSubjectRule);

    computed.push({ studentId: student.id, sectionId: student.sectionId, totalMarks, gpa: overall.gpa, letterGrade: overall.letterGrade, hasFailed: overall.hasFailed });
  }

  // Competition ranking (ties share a rank) — class-wide and section-wide.
  const rank = (items: typeof computed, key: 'all' | string) => {
    const scoped = key === 'all' ? items : items.filter((c) => c.sectionId === key);
    const sorted = [...scoped].sort((a, b) => b.gpa - a.gpa);
    const positions = new Map<string, number>();
    sorted.forEach((c, i) => {
      const tiedAbove = sorted.slice(0, i).filter((x) => x.gpa === c.gpa).length;
      positions.set(c.studentId, tiedAbove > 0 ? (positions.get(sorted[i - tiedAbove]!.studentId) ?? i + 1) : i + 1);
    });
    return positions;
  };

  const classPositions = rank(computed, 'all');
  const sectionGroups = [...new Set(computed.map((c) => c.sectionId))];
  const sectionPositions = new Map<string, number>();
  for (const sectionId of sectionGroups) {
    for (const [studentId, pos] of rank(computed, sectionId)) sectionPositions.set(studentId, pos);
  }

  const studentNames = new Map(students.map((s) => [s.id, s.studentUid]));
  const registrations = computed.map((c) => ({
    studentId: c.studentId,
    ...buildDocumentRegistration({
      tenantId: req.tenantId!,
      docType: 'marksheet',
      entityId: `${examId}_${c.studentId}`,
      canonicalData: { examId, studentId: c.studentId, gpa: c.gpa, totalMarks: c.totalMarks },
      publicPayload: { studentUid: studentNames.get(c.studentId), examName: exam.name, gpa: c.gpa, letterGrade: c.letterGrade },
    }),
  }));

  await req.db!.$transaction([
    ...computed.map((c) =>
      req.db!.examResult.upsert({
        where: { examId_studentId: { examId, studentId: c.studentId } },
        create: {
          tenantId: req.tenantId!,
          examId,
          studentId: c.studentId,
          classId,
          sectionId: c.sectionId,
          totalMarks: c.totalMarks,
          gpa: c.gpa,
          letterGrade: c.letterGrade,
          hasFailed: c.hasFailed,
          positionInClass: classPositions.get(c.studentId),
          positionInSection: sectionPositions.get(c.studentId),
        },
        update: {
          totalMarks: c.totalMarks,
          gpa: c.gpa,
          letterGrade: c.letterGrade,
          hasFailed: c.hasFailed,
          positionInClass: classPositions.get(c.studentId),
          positionInSection: sectionPositions.get(c.studentId),
          computedAt: new Date(),
        },
      }),
    ),
    req.db!.resultPublication.upsert({
      where: { examId_classId: { examId, classId } },
      create: { examId, classId, isPublished: true, publishedAt: new Date(), publishedBy: req.user!.sub },
      update: { isPublished: true, publishedAt: new Date(), publishedBy: req.user!.sub },
    }),
    req.db!.outboxEvent.create({
      data: { tenantId: req.tenantId!, eventType: 'result.published', payload: { examId, classId, studentCount: computed.length } },
    }),
    ...registrations.map((r) =>
      req.db!.documentRegistry.create({
        data: {
          tenantId: req.tenantId!,
          docType: 'marksheet',
          entityId: `${examId}_${r.studentId}`,
          verificationCode: r.verificationCode,
          contentHash: r.contentHash,
          publicPayload: r.publicPayload,
        },
      }),
    ),
  ]);

  return res.json({ publishedCount: computed.length, verificationCodes: registrations.map((r) => ({ studentId: r.studentId, code: r.verificationCode })) });
});

examsRouter.get('/:id/results', requirePermission('exams', 'read'), async (req, res) => {
  const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
  const results = await req.db!.examResult.findMany({
    where: { examId: req.params.id as string, ...(classId ? { classId } : {}) },
    include: { },
    orderBy: { positionInClass: 'asc' },
  });
  res.json(results);
});

examsRouter.get('/:id/results/:studentId', requirePermission('exams', 'read'), async (req, res) => {
  const result = await req.db!.examResult.findUnique({
    where: { examId_studentId: { examId: req.params.id as string, studentId: req.params.studentId as string } },
  });
  if (!result) return res.status(404).json({ error: 'Result not found or not yet published' });

  const subjectEntries = await req.db!.markEntry.findMany({
    where: { examId: req.params.id as string, studentId: req.params.studentId as string, attemptNumber: 1, status: 'APPROVED' },
  });

  return res.json({ ...result, subjects: subjectEntries });
});

// ── Document generation (PRD §9, first real use of the Document Service) ──
examsRouter.get('/:id/results/:studentId/marksheet', requirePermission('exams', 'read'), async (req, res) => {
  const examId = req.params.id as string;
  const studentId = req.params.studentId as string;

  const [exam, examResult, student, tenant, doc] = await Promise.all([
    req.db!.exam.findUniqueOrThrow({ where: { id: examId } }),
    req.db!.examResult.findUnique({ where: { examId_studentId: { examId, studentId } } }),
    req.db!.student.findUniqueOrThrow({ where: { id: studentId }, include: { user: true, section: { include: { class: true } } } }),
    req.db!.tenant.findUniqueOrThrow({ where: { id: req.tenantId! } }),
    req.db!.documentRegistry.findFirst({ where: { docType: 'marksheet', entityId: `${examId}_${studentId}` }, orderBy: { issuedAt: 'desc' } }),
  ]);

  if (!examResult || !doc) return res.status(404).json({ error: 'Result not published yet for this student' });

  const academicYear = await req.db!.academicYear.findUniqueOrThrow({ where: { id: exam.academicYearId } });
  const markEntries = await req.db!.markEntry.findMany({ where: { examId, studentId, attemptNumber: 1, status: 'APPROVED' } });
  const subjects = await req.db!.subject.findMany({ where: { id: { in: markEntries.map((m) => m.subjectId) } } });
  const configs = await req.db!.examSubjectConfig.findMany({ where: { examId, subjectId: { in: markEntries.map((m) => m.subjectId) } } });

  const qrDataUrl = await generateQrDataUrl(`${VERIFY_BASE_URL}/${doc.verificationCode}`);

  const html = buildMarksheetHtml({
    institution: { nameEn: tenant.nameEn, nameBn: tenant.nameBn, eiin: tenant.eiin },
    student: {
      name: student.user.name,
      studentUid: student.studentUid,
      rollNo: student.rollNo,
      className: student.section?.class.name ?? '—',
      sectionName: student.section?.name ?? '—',
    },
    exam: { name: exam.name, academicYearLabel: academicYear.label },
    subjects: markEntries.map((m) => {
      const subject = subjects.find((s) => s.id === m.subjectId);
      const config = configs.find((c) => c.subjectId === m.subjectId);
      return {
        nameEn: subject?.nameEn ?? m.subjectId,
        nameBn: subject?.nameBn,
        marksObtained: m.marksObtained ? Number(m.marksObtained) : null,
        isAbsent: m.isAbsent,
        grade: m.grade ?? '—',
        fullMarks: config?.fullMarks ?? 100,
      };
    }),
    result: {
      gpa: Number(examResult.gpa),
      letterGrade: examResult.letterGrade,
      totalMarks: Number(examResult.totalMarks),
      positionInClass: examResult.positionInClass,
      hasFailed: examResult.hasFailed,
    },
    qrDataUrl,
    verificationCode: doc.verificationCode,
  });

  const pdf = await renderHtmlToPdf(html);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="marksheet-${student.studentUid}.pdf"`);
  return res.send(pdf);
});

// Bulk print: whole-class tabulation sheet (PRD §7.5), print-ready for the notice board.
examsRouter.get('/:id/tabulation/:classId', requirePermission('exams', 'read'), async (req, res) => {
  const examId = req.params.id as string;
  const classId = req.params.classId as string;

  const [exam, tenant, klass, results] = await Promise.all([
    req.db!.exam.findUniqueOrThrow({ where: { id: examId } }),
    req.db!.tenant.findUniqueOrThrow({ where: { id: req.tenantId! } }),
    req.db!.class.findUniqueOrThrow({ where: { id: classId } }),
    req.db!.examResult.findMany({
      where: { examId, classId },
      orderBy: { positionInClass: 'asc' },
      include: { },
    }),
  ]);

  if (results.length === 0) return res.status(404).json({ error: 'No published results for this class yet' });

  const academicYear = await req.db!.academicYear.findUniqueOrThrow({ where: { id: exam.academicYearId } });
  const students = await req.db!.student.findMany({
    where: { id: { in: results.map((r) => r.studentId) } },
    include: { user: true, section: true },
  });
  const allEntries = await req.db!.markEntry.findMany({
    where: { examId, studentId: { in: results.map((r) => r.studentId) }, attemptNumber: 1, status: 'APPROVED' },
  });
  const subjectIds = [...new Set(allEntries.map((e) => e.subjectId))];
  const subjects = await req.db!.subject.findMany({ where: { id: { in: subjectIds } } });

  const rows: TabulationRow[] = results.map((r) => {
    const student = students.find((s) => s.id === r.studentId)!;
    const entries = allEntries.filter((e) => e.studentId === r.studentId);
    const marksBySubject: Record<string, number | 'Ab'> = {};
    for (const e of entries) {
      const subjectName = subjects.find((s) => s.id === e.subjectId)?.nameEn ?? e.subjectId;
      marksBySubject[subjectName] = e.isAbsent ? 'Ab' : Number(e.marksObtained ?? 0);
    }
    return {
      rollNo: student.rollNo ?? '—',
      studentUid: student.studentUid,
      name: student.user.name,
      marksBySubject,
      totalMarks: Number(r.totalMarks),
      gpa: Number(r.gpa),
      letterGrade: r.letterGrade,
      position: r.positionInClass,
    };
  });

  const html = buildTabulationHtml({
    institution: { nameEn: tenant.nameEn, nameBn: tenant.nameBn },
    exam: { name: exam.name, academicYearLabel: academicYear.label },
    className: klass.name,
    sectionName: students[0]?.section?.name ?? '',
    subjectNames: subjects.map((s) => s.nameEn),
    rows,
  });

  const pdf = await renderHtmlToPdf(html);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="tabulation-${klass.name}.pdf"`);
  return res.send(pdf);
});
