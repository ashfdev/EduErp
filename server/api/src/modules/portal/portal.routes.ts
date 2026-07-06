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
import { cached } from "../../lib/cache";
import { getPaymentAdapter } from "../../services/payment";
import { renderDocument } from "../../services/pdf.service";
import { buildMarksheetData } from "../documents/documents.routes";
import { documentUpload, verifyDocumentMagicBytes } from "../../middleware/upload";
import { uploadBuffer } from "../../services/storage.service";
import { computeStudentLibraryFines } from "../library/library-fine.helper";
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

    // Cached per-student (assertAccess above already gated this specific
    // request; the cached payload itself carries no cross-student data, so
    // any other authorized viewer of the same student correctly gets the
    // same cached snapshot).
    const data = await cached(`portal-dashboard:${id}`, 5 * 60, () => buildStudentDashboard(id));
    res.json({ success: true, data });
  }),
);

async function buildStudentDashboard(id: string) {
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

    return {
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
    };
}

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

// Forecast only — diffs active FeeStructure rows against Invoices that
// already exist for this student, so the portal can show "Exam Fee: not yet
// invoiced, projected ৳X" ahead of time. Never creates a real Invoice and
// never touches the Accounts auto-journal — this is display-only, distinct
// from the real due/outstanding totals already served by /fees above.
portalRouter.get(
  "/student/:id/upcoming-dues",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);
    const student = await prisma.student.findUnique({ where: { id } });
    if (!student?.current_class_id) return res.json({ success: true, data: [] });

    const activeYear = await prisma.academicYear.findFirst({ where: { is_active: true } });
    if (!activeYear) return res.json({ success: true, data: [] });

    const structures = await prisma.feeStructure.findMany({
      where: {
        academic_year_id: activeYear.id,
        is_active: true,
        OR: [{ class_id: null }, { class_id: student.current_class_id }],
      },
    });

    const now = new Date();
    const projected: { category: string; name: string; amount: number; frequency: string }[] = [];
    for (const structure of structures) {
      if (structure.section_id && structure.section_id !== student.current_section_id) continue;

      if (structure.frequency === "MONTHLY") {
        const existing = await prisma.invoice.findFirst({
          where: { student_id: id, fee_structure_id: structure.id, month: now.getMonth() + 1, year: now.getFullYear() },
        });
        if (!existing) projected.push({ category: structure.category, name: structure.name, amount: structure.amount, frequency: "This month" });
      } else {
        const existing = await prisma.invoice.findFirst({ where: { student_id: id, fee_structure_id: structure.id, academic_year_id: activeYear.id } });
        if (!existing) projected.push({ category: structure.category, name: structure.name, amount: structure.amount, frequency: structure.frequency === "YEARLY" ? "This year" : "One-time" });
      }
    }

    res.json({ success: true, data: projected });
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

portalRouter.get(
  "/student/:id/transport-hostel",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);

    const [transport, hostel] = await Promise.all([
      prisma.studentTransport.findUnique({
        where: { student_id: id },
        include: { route: { select: { name: true, fare: true } } },
      }),
      prisma.hostelAllocation.findFirst({
        where: { student_id: id, is_active: true },
        include: { room: { select: { room_no: true, block: { select: { name: true } } } } },
        orderBy: { from_date: "desc" },
      }),
    ]);

    res.json({
      success: true,
      data: {
        transport: transport ? { route_name: transport.route.name, fare: transport.route.fare, pickup_stop: transport.pickup_stop } : null,
        hostel: hostel ? { block_name: hostel.room.block.name, room_no: hostel.room.room_no, bed_no: hostel.bed_no, from_date: hostel.from_date } : null,
      },
    });
  }),
);

// Clearance gate: accounts due -> library fine -> exam office approval.
// Accounts is only enforced if FeeRules.block_admit_on_due is set (an
// existing, previously-dead Settings flag) — library and exam-office are
// always checked, matching the fixed 3-stage pipeline this was asked for.
async function checkAdmitCardClearance(studentId: string, examId: string) {
  const rules = await prisma.feeRules.findUnique({ where: { id: "singleton" } });
  const invoices = await prisma.invoice.findMany({ where: { student_id: studentId, status: { notIn: ["PAID", "WAIVED"] } } });
  const dueAmount = invoices.reduce((sum, inv) => sum + (inv.amount_due + inv.fine_amount - inv.amount_paid), 0);
  const accountsRequired = rules?.block_admit_on_due ?? false;
  const accountsClear = !accountsRequired || dueAmount <= 0;

  const { total_fines } = await computeStudentLibraryFines(studentId);
  const libraryClear = total_fines <= 0;

  const seatPlan = await prisma.examSeatPlan.findUnique({ where: { exam_id_student_id: { exam_id: examId, student_id: studentId } } });
  const examOfficeClear = seatPlan?.exam_office_cleared ?? false;

  return {
    accounts: { required: accountsRequired, clear: accountsClear, due_amount: dueAmount },
    library: { clear: libraryClear, fine_amount: total_fines },
    exam_office: { clear: examOfficeClear },
    all_clear: accountsClear && libraryClear && examOfficeClear,
  };
}

portalRouter.get(
  "/student/:id/admit-card/:exam_id/clearance",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const examId = reqParam(req, "exam_id");
    await assertAccess(req.user!.sub, req.user!.role, id);
    res.json({ success: true, data: await checkAdmitCardClearance(id, examId) });
  }),
);

portalRouter.get(
  "/student/:id/admit-card/:exam_id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const examId = reqParam(req, "exam_id");
    await assertAccess(req.user!.sub, req.user!.role, id);

    const clearance = await checkAdmitCardClearance(id, examId);
    if (!clearance.all_clear) throw forbidden("Admit card is locked — clear all pending items first");

    const [exam, student, subjectConfigs, seatPlan] = await Promise.all([
      prisma.exam.findUnique({ where: { id: examId } }),
      prisma.student.findUnique({ where: { id }, include: { current_class: true, current_section: true } }),
      prisma.examSubjectConfig.findMany({ where: { exam_id: examId }, include: { subject: true } }),
      prisma.examSeatPlan.findUnique({ where: { exam_id_student_id: { exam_id: examId, student_id: id } } }),
    ]);
    if (!exam || !student) throw notFound("Exam or student not found");

    const academicYear = exam.academic_year_id ? await prisma.academicYear.findUnique({ where: { id: exam.academic_year_id } }) : null;
    const schedule = subjectConfigs.map((sc) => ({
      date: exam.start_date,
      day: exam.start_date ? new Date(exam.start_date).toLocaleDateString("en-US", { weekday: "long" }) : "",
      subject_name: sc.subject.name_en,
      time: "10:00 AM - 1:00 PM",
      hall: seatPlan?.hall_name ?? "TBA",
      seat_no: seatPlan?.seat_number ?? "TBA",
    }));

    const pdf = await renderDocument("ADMIT_CARD", { student, exam_name: exam.name, academic_year_label: academicYear?.label ?? "", schedule } as unknown as Record<string, unknown>);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="admit-card-${student.student_uid}.pdf"`);
    res.send(pdf);
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
    const payment = await prisma.payment.create({ data: { invoice_id: invoice.id, gateway: body.gateway, transaction_id: transactionId, amount: invoice.amount_due - invoice.amount_paid, status: "INITIATED" } });

    res.json({ success: true, data: { payment_id: payment.id, payment_url: result.payment_url, session_id: result.session_id } });
  }),
);

// Bank-transfer only — student uploads their slip right after /fees/pay
// creates the INITIATED payment, so staff has something to verify against.
portalRouter.post(
  "/fees/payments/:id/slip",
  documentUpload.single("slip"),
  verifyDocumentMagicBytes,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const payment = await prisma.payment.findUnique({ where: { id }, include: { invoice: true } });
    if (!payment) throw notFound("Payment not found");
    await assertAccess(req.user!.sub, req.user!.role, payment.invoice.student_id);
    if (payment.gateway !== "BANK_TRANSFER") throw badRequest("Slip upload only applies to bank-transfer payments");
    if (!req.file) throw badRequest("A slip image/PDF is required");

    const { url } = await uploadBuffer("bank-slips", req.file.originalname, req.file.buffer, req.file.mimetype);
    const updated = await prisma.payment.update({ where: { id }, data: { receipt_url: url } });
    res.json({ success: true, data: updated });
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
