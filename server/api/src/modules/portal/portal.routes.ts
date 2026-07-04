import { Router } from "express";
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { PORTAL_ROLES } from "../../lib/roles";
import { pushSubscribeSchema, pushUnsubscribeSchema, portalPaySchema } from "@education-erp/validators";
import { calculateStudentResult } from "../../utils/grading.engine";
import { getPaymentAdapter } from "../../services/payment";
import { renderDocument } from "../../services/pdf.service";
import { buildMarksheetData } from "../documents/documents.routes";
import { badRequest, forbidden, notFound } from "../../lib/errors";

export const portalRouter = Router();
portalRouter.use(authenticate, authorize(PORTAL_ROLES));

async function accessibleStudentIds(userId: string, role: string): Promise<string[]> {
  if (role === "STUDENT") {
    const student = await prisma.student.findUnique({ where: { user_id: userId } });
    return student ? [student.id] : [];
  }
  if (role === "GUARDIAN") {
    const guardian = await prisma.guardian.findUnique({ where: { user_id: userId }, include: { students: { where: { deleted_at: null } } } });
    return guardian ? guardian.students.map((s) => s.id) : [];
  }
  return [];
}

async function assertAccess(userId: string, role: string, studentId: string): Promise<void> {
  const ids = await accessibleStudentIds(userId, role);
  if (!ids.includes(studentId)) throw forbidden("You do not have access to this student's data");
}

portalRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const ids = await accessibleStudentIds(req.user!.sub, req.user!.role);
    const students = await prisma.student.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, student_uid: true, name_en: true, name_bn: true, photo_url: true,
        current_roll_no: true, current_class: { select: { id: true, name_en: true } }, current_section: { select: { id: true, name: true } },
      },
    });
    res.json({ success: true, data: { role: req.user!.role, students } });
  }),
);

// Full profile fields (phone, guardian contacts, registration no) live behind
// ownership-checked /student/:id endpoints rather than reusing the admin
// GET /api/students/:id route, which has no per-student ownership check and
// would otherwise let any STUDENT/GUARDIAN token read any other student's
// record.
portalRouter.get(
  "/student/:id/profile",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);
    const student = await prisma.student.findUnique({
      where: { id },
      select: {
        student_uid: true, name_en: true, name_bn: true, photo_url: true, phone: true,
        current_roll_no: true, registration_no: true,
        current_class: { select: { name_en: true } }, current_section: { select: { name: true } },
        father_name: true, father_phone: true, mother_name: true, mother_phone: true,
      },
    });
    if (!student) throw notFound("Student not found");
    res.json({ success: true, data: student });
  }),
);

portalRouter.get(
  "/student/:id/dashboard",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);

    const student = await prisma.student.findUnique({
      where: { id },
      include: { current_class: true, current_section: true },
    });
    if (!student) throw notFound("Student not found");

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayRecord, monthRecords, upcomingExams, notices, invoices, homeworkAll] = await Promise.all([
      prisma.attendanceRecord.findFirst({ where: { person_id: id, person_type: "STUDENT", date: { gte: todayStart, lt: todayEnd } } }),
      prisma.attendanceRecord.findMany({ where: { person_id: id, person_type: "STUDENT", date: { gte: monthStart, lt: todayEnd } } }),
      prisma.exam.findMany({ where: { status: { in: ["ACTIVE", "MARK_ENTRY"] }, start_date: { gte: now } }, orderBy: { start_date: "asc" }, take: 2 }),
      prisma.notice.findMany({ where: { is_published: true, audience: { in: ["STUDENTS", "ALL", "PUBLIC"] } }, orderBy: [{ is_pinned: "desc" }, { publish_at: "desc" }], take: 3 }),
      prisma.invoice.findMany({ where: { student_id: id, status: { notIn: ["PAID", "WAIVED"] } }, orderBy: { due_date: "asc" } }),
      student.current_class_id
        ? prisma.homework.findMany({ where: { class_id: student.current_class_id, OR: [{ section_id: student.current_section_id }, { section_id: null }] }, orderBy: { due_date: "asc" } })
        : Promise.resolve([]),
    ]);

    const monthPresent = monthRecords.filter((r) => r.status === "PRESENT").length;
    const outstandingTotal = invoices.reduce((sum, i) => sum + (i.amount_due + i.fine_amount - i.amount_paid), 0);
    const nextInvoice = invoices[0];

    let recentResults: unknown[] = [];
    const latestPublication = await prisma.resultPublication.findFirst({
      where: { is_published: true, class_id: student.current_class_id ?? undefined },
      orderBy: { published_at: "desc" },
      include: { exam: { include: { grading_scale: { include: { ranges: true } } } } },
    });
    if (latestPublication) {
      const entries = await prisma.markEntry.findMany({ where: { exam_id: latestPublication.exam_id, student_id: id }, include: { subject: true } });
      if (entries.length) {
        const subjectInputs = entries.map((e) => ({ subject_id: e.subject_id, subject_name: e.subject.name_en, is_optional: e.subject.is_optional, marks_total: e.marks_total, is_absent: e.is_absent }));
        const result = calculateStudentResult(subjectInputs, latestPublication.exam.grading_scale?.ranges ?? [], false);
        recentResults = [{ exam_name: latestPublication.exam.name, gpa: result.total_gpa, grade: result.overall_grade_letter }];
      }
    }

    res.json({
      success: true,
      data: {
        student: {
          name: student.name_en, uid: student.student_uid, class: student.current_class?.name_en, section: student.current_section?.name,
          roll: student.current_roll_no, photo: student.photo_url,
        },
        attendance: {
          today_status: todayRecord?.status ?? "NOT_MARKED",
          this_month_percentage: monthRecords.length ? Math.round((monthPresent / monthRecords.length) * 1000) / 10 : null,
        },
        upcoming_exams: upcomingExams.map((e) => ({ id: e.id, name: e.name, start_date: e.start_date })),
        recent_results: recentResults,
        fee_dues: { total_outstanding: Math.round(outstandingTotal * 100) / 100, next_due_date: nextInvoice?.due_date ?? null, next_due_amount: nextInvoice ? nextInvoice.amount_due + nextInvoice.fine_amount - nextInvoice.amount_paid : null },
        recent_notices: notices,
        homework: { pending: homeworkAll.filter((h) => h.due_date >= now).length, submitted: 0, recent: homeworkAll.slice(0, 3) },
      },
    });
  }),
);

portalRouter.get(
  "/student/:id/attendance",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);
    const records = await prisma.attendanceRecord.findMany({ where: { person_id: id, person_type: "STUDENT" }, orderBy: { date: "desc" }, take: 400 });
    res.json({ success: true, data: records });
  }),
);

portalRouter.get(
  "/student/:id/results",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);

    const student = await prisma.student.findUnique({ where: { id } });
    if (!student) throw notFound("Student not found");

    const publications = await prisma.resultPublication.findMany({
      where: { is_published: true, class_id: student.current_class_id ?? undefined },
      include: { exam: { include: { grading_scale: { include: { ranges: true } } } } },
    });

    const results = [];
    for (const pub of publications) {
      const entries = await prisma.markEntry.findMany({ where: { exam_id: pub.exam_id, student_id: id }, include: { subject: true } });
      if (!entries.length) continue;
      const subjectInputs = entries.map((e) => ({ subject_id: e.subject_id, subject_name: e.subject.name_en, is_optional: e.subject.is_optional, marks_total: e.marks_total, is_absent: e.is_absent }));
      const result = calculateStudentResult(subjectInputs, pub.exam.grading_scale?.ranges ?? [], false);
      results.push({
        exam_id: pub.exam_id, exam_name: pub.exam.name,
        subjects: entries.map((e) => ({ subject_name: e.subject.name_en, marks_theory: e.marks_theory, marks_practical: e.marks_practical, marks_total: e.marks_total, grade_letter: e.grade_letter, is_absent: e.is_absent })),
        total_gpa: result.total_gpa, overall_grade: result.overall_grade_letter, has_failed: result.has_failed,
      });
    }

    res.json({ success: true, data: results });
  }),
);

portalRouter.get(
  "/student/:id/results/:exam_id/marksheet",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const examId = reqParam(req, "exam_id");
    await assertAccess(req.user!.sub, req.user!.role, id);

    const data = await buildMarksheetData(examId, id);
    const pdf = await renderDocument("MARKSHEET", data as unknown as Record<string, unknown>);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="marksheet-${data.student.student_uid}.pdf"`);
    res.send(pdf);
  }),
);

portalRouter.get(
  "/student/:id/fees",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);
    const invoices = await prisma.invoice.findMany({ where: { student_id: id }, include: { payments: true }, orderBy: { due_date: "desc" } });
    res.json({ success: true, data: invoices });
  }),
);

portalRouter.get(
  "/student/:id/homework",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);
    const student = await prisma.student.findUnique({ where: { id } });
    if (!student?.current_class_id) return res.json({ success: true, data: [] });

    const homework = await prisma.homework.findMany({
      where: { class_id: student.current_class_id, OR: [{ section_id: student.current_section_id }, { section_id: null }] },
      include: { subject: true },
      orderBy: { due_date: "desc" },
    });
    res.json({ success: true, data: homework });
  }),
);

portalRouter.get(
  "/student/:id/routine",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);
    const student = await prisma.student.findUnique({ where: { id } });
    if (!student?.current_class_id) return res.json({ success: true, data: [] });

    const slots = await prisma.routineSlot.findMany({
      where: { class_id: student.current_class_id, OR: [{ section_id: student.current_section_id }, { section_id: null }] },
      include: { subject: true },
      orderBy: [{ day_of_week: "asc" }, { period_no: "asc" }],
    });
    res.json({ success: true, data: slots });
  }),
);

portalRouter.get(
  "/student/:id/notices",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);
    const notices = await prisma.notice.findMany({
      where: { is_published: true, audience: { in: ["STUDENTS", "ALL", "PUBLIC"] } },
      orderBy: [{ is_pinned: "desc" }, { publish_at: "desc" }],
      take: 50,
    });
    res.json({ success: true, data: notices });
  }),
);

portalRouter.get(
  "/student/:id/subjects",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);
    const studentSubjects = await prisma.studentSubject.findMany({ where: { student_id: id }, include: { subject: true } });

    const withTeacher = await Promise.all(
      studentSubjects.map(async (ss) => {
        const student = await prisma.student.findUnique({ where: { id } });
        const assignment = await prisma.subjectTeacherAssignment.findFirst({
          where: { subject_id: ss.subject_id, section_id: student?.current_section_id ?? undefined },
          include: { staff: { select: { name_en: true, designation: true } } },
        });
        return { subject: ss.subject, is_inherited: ss.is_inherited, teacher: assignment?.staff ?? null };
      }),
    );
    res.json({ success: true, data: withTeacher });
  }),
);

portalRouter.post(
  "/fees/pay",
  asyncHandler(async (req, res) => {
    const body = portalPaySchema.parse(req.body);
    const invoice = await prisma.invoice.findUnique({ where: { id: body.invoice_id } });
    if (!invoice) throw notFound("Invoice not found");
    await assertAccess(req.user!.sub, req.user!.role, invoice.student_id);

    const adapter = getPaymentAdapter(body.gateway);
    if (!adapter.isConfigured()) throw badRequest(`${body.gateway} is not configured yet — merchant credentials are pending`);

    const transactionId = randomUUID();
    const result = await adapter.initiatePayment({ invoice_id: invoice.id, amount: invoice.amount_due - invoice.amount_paid, transaction_id: transactionId });
    await prisma.payment.create({ data: { invoice_id: invoice.id, gateway: body.gateway, transaction_id: transactionId, amount: invoice.amount_due - invoice.amount_paid, status: "INITIATED" } });

    res.json({ success: true, data: { payment_url: result.payment_url, session_id: result.session_id } });
  }),
);

portalRouter.post(
  "/push-subscribe",
  asyncHandler(async (req, res) => {
    const body = pushSubscribeSchema.parse(req.body);
    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: { user_id: req.user!.sub, endpoint: body.endpoint, keys_p256dh: body.keys.p256dh, keys_auth: body.keys.auth },
      update: { keys_p256dh: body.keys.p256dh, keys_auth: body.keys.auth },
    });
    res.status(201).json({ success: true, data: { id: subscription.id } });
  }),
);

portalRouter.delete(
  "/push-unsubscribe",
  asyncHandler(async (req, res) => {
    const body = pushUnsubscribeSchema.parse(req.body);
    await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, user_id: req.user!.sub } });
    res.status(204).send();
  }),
);
