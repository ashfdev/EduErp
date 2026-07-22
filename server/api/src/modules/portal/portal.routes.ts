import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { PORTAL_ROLES, COMPLAINT_MANAGE_ROLES, DOCUMENT_REQUEST_REVIEW_ROLES } from "../../lib/roles";
import { pushSubscribeSchema, pushUnsubscribeSchema, portalPaySchema, createComplaintSchema, createComplaintMessageSchema, ptmBookSchema, submitQuizAttemptSchema, flagQuizAttemptSchema, createDocumentRequestSchema } from "@education-erp/validators";
import { quizFlagLimiter } from "../../middleware/rate-limit";
import { calculateStudentResult } from "../../utils/grading.engine";
import { cached } from "../../lib/cache";
import { getPaymentAdapter } from "../../services/payment";
import { renderDocument, generateQrDataUrl } from "../../services/pdf.service";
import { buildMarksheetData, sendPdf } from "../documents/documents.routes";
import { documentUpload, verifyDocumentMagicBytes } from "../../middleware/upload";
import { uploadBuffer, getSignedDownloadUrl } from "../../services/storage.service";
import { syncOverdueInvoices } from "../fees/invoice-helpers";
import { checkAdmitCardClearance } from "../../lib/admit-card-clearance";
import { computeSubjectWiseAttendance } from "../../utils/subject-attendance";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { allowIframeEmbed } from "../../middleware/allow-iframe";
import { postComplaintMessage } from "../complaints/complaint-message.helper";
import { notifyRoles } from "../../services/in-app-notification.service";

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
      // A grouped class publishes independently per group — without this,
      // "most recently published" could resolve to a different group's
      // publication row than the one this student's own group actually has.
      where: { is_published: true, class_id: student.current_class_id ?? undefined, group_id: student.group_id ?? null },
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
        check_in_at: todayRecord?.check_in_at ?? null,
        check_out_at: todayRecord?.check_out_at ?? null,
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

// Real per-subject attendance breakdown (Plan Twelve) — the direct answer
// to "ei subject e attendance koto percentage" (what % attendance in this
// subject), which didn't exist anywhere in the system before this.
portalRouter.get(
  "/student/:id/subject-attendance",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);

    const activeYear = await prisma.academicYear.findFirst({ where: { is_active: true } });
    const dateRange = activeYear ? { gte: activeYear.start_date, lte: activeYear.end_date } : undefined;
    const summary = (await computeSubjectWiseAttendance(prisma, [id], dateRange)).get(id)!;

    const subjectIds = summary.subjects.map((s) => s.subject_id);
    const subjects = await prisma.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name_en: true } });
    const nameById = new Map(subjects.map((s) => [s.id, s.name_en]));

    res.json({
      success: true,
      data: {
        overall: summary.overall,
        subjects: summary.subjects
          .map((s) => ({ subject_id: s.subject_id, subject_name_en: nameById.get(s.subject_id) ?? "Unknown", present: s.present, total: s.total, percentage: s.percentage }))
          .sort((a, b) => a.subject_name_en.localeCompare(b.subject_name_en)),
      },
    });
  }),
);

portalRouter.get(
  "/student/:id/results",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);
    const query = z.object({ exam_type_config_id: z.string().optional(), academic_year_id: z.string().optional() }).parse(req.query);

    const student = await prisma.student.findUnique({ where: { id } });
    if (!student) throw notFound("Student not found");

    // A student's class at the time of an exam may differ from their
    // current class if they've since been promoted — resolve per-exam via
    // StudentAcademicHistory (same fix as the public /results/public/lookup
    // route) instead of always trusting current_class_id, otherwise a
    // promoted student's older published result silently disappears from
    // their own portal.
    const histories = await prisma.studentAcademicHistory.findMany({ where: { student_id: id } });
    const classForYear = new Map(histories.map((h) => [h.academic_year_id, h.class_id]));

    const candidatePublications = await prisma.resultPublication.findMany({
      where: {
        is_published: true,
        ...((query.exam_type_config_id || query.academic_year_id) && {
          exam: {
            ...(query.exam_type_config_id && { exam_type_config_id: query.exam_type_config_id }),
            ...(query.academic_year_id && { academic_year_id: query.academic_year_id }),
          },
        }),
      },
      include: { exam: { include: { grading_scale: { include: { ranges: true } } } } },
    });
    const publications = candidatePublications.filter((pub) => {
      const resolvedClassId = classForYear.get(pub.exam.academic_year_id) ?? student.current_class_id;
      if (resolvedClassId !== pub.class_id) return false;
      // See the identical group-matching note in results.routes.ts's
      // /public/lookup — same current-group-id comparison, same known
      // limitation (no historical per-year group record exists yet).
      return pub.group_id === (student.group_id ?? null);
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

    // FeeRules.block_result_on_due — previously a dead flag with zero
    // enforcement anywhere; mirrors the due-amount check already used for
    // admit-card clearance (checkAdmitCardClearance's accounts stage).
    const rules = await prisma.feeRules.findUnique({ where: { id: "singleton" } });
    if (rules?.block_result_on_due) {
      const invoices = await prisma.invoice.findMany({ where: { student_id: id, status: { notIn: ["PAID", "WAIVED"] } } });
      const dueAmount = invoices.reduce((sum, inv) => sum + (inv.amount_due + inv.fine_amount - inv.amount_paid), 0);
      if (dueAmount > 0) throw forbidden("Result is locked — please clear outstanding dues first");
    }

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
    await syncOverdueInvoices(prisma, id);
    const [invoices, student] = await Promise.all([
      prisma.invoice.findMany({
        where: { student_id: id },
        include: { payments: true, fee_structure: { select: { frequency: true } } },
        orderBy: { due_date: "desc" },
      }),
      prisma.student.findUnique({ where: { id }, select: { credit_balance: true } }),
    ]);
    res.json({ success: true, data: { invoices, credit_balance: student?.credit_balance ?? 0 } });
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

// Second of the three required access-control layers for the Resource
// Library (list-filter is the first, signed-URL file serving is the third):
// re-checked against this ONE resource's actual targeting before anything is
// returned, never just trusted from the list query that got the caller here.
function isResourceEligible(
  resource: { class_id: string; section_id: string | null; is_published: boolean; publish_at: Date | null; expire_at: Date | null },
  studentClassId: string,
  studentSectionId: string | null,
): boolean {
  const now = new Date();
  if (resource.class_id !== studentClassId) return false;
  if (resource.section_id !== null && resource.section_id !== studentSectionId) return false;
  if (!resource.is_published) return false;
  if (resource.publish_at && resource.publish_at > now) return false;
  if (resource.expire_at && resource.expire_at <= now) return false;
  return true;
}

portalRouter.get(
  "/student/:id/resources",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);
    const student = await prisma.student.findUnique({ where: { id } });
    if (!student?.current_class_id) return res.json({ success: true, data: [] });

    const now = new Date();
    const resources = await prisma.teachingResource.findMany({
      where: {
        class_id: student.current_class_id,
        is_published: true,
        AND: [
          { OR: [{ section_id: student.current_section_id }, { section_id: null }] },
          { OR: [{ publish_at: null }, { publish_at: { lte: now } }] },
          { OR: [{ expire_at: null }, { expire_at: { gt: now } }] },
        ],
      },
      include: { subject: { select: { name_en: true } }, teacher: { select: { name_en: true } } },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: resources });
  }),
);

// The single-resource endpoint a direct-object-reference attack would target
// (guessing/enumerating resource_id values) — 404s exactly like a genuinely
// nonexistent id would, so an ineligible caller can't distinguish "wrong
// section" from "doesn't exist" (never 403 here, that would confirm existence).
portalRouter.get(
  "/student/:id/resources/:resource_id/download",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);
    const student = await prisma.student.findUnique({ where: { id } });
    if (!student?.current_class_id) throw notFound("Resource not found");

    const resource = await prisma.teachingResource.findUnique({ where: { id: reqParam(req, "resource_id") } });
    if (!resource || !isResourceEligible(resource, student.current_class_id, student.current_section_id)) {
      throw notFound("Resource not found");
    }

    const url = await getSignedDownloadUrl(resource.blob_key);
    res.json({ success: true, data: { url } });
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
      where: {
        class_id: student.current_class_id,
        OR: [{ section_id: student.current_section_id }, { section_id: null }],
        // A Group-restricted slot only belongs on this student's own
        // schedule if it's their Group; a shared (group_id: null) slot is
        // on every student's schedule regardless of Group.
        AND: [{ OR: [{ group_id: student.group_id }, { group_id: null }] }],
      },
      include: { subject: true, group: { select: { name_en: true } } },
      orderBy: [{ day_of_week: "asc" }, { period_no: "asc" }],
    });
    res.json({ success: true, data: slots });
  }),
);

portalRouter.post(
  "/student/:id/document-requests",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);
    const body = createDocumentRequestSchema.omit({ student_id: true }).parse(req.body);

    const request = await prisma.documentRequest.create({
      data: { student_id: id, requested_by_user_id: req.user!.sub, doc_type: body.doc_type, reason: body.reason },
    });
    await notifyRoles(DOCUMENT_REQUEST_REVIEW_ROLES, {
      type: "DOCUMENT_REQUESTED",
      title: "New document request",
      body: `${body.doc_type} requested`,
      link: "/document-requests",
    });
    res.status(201).json({ success: true, data: request });
  }),
);

portalRouter.get(
  "/student/:id/document-requests",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);
    const requests = await prisma.documentRequest.findMany({ where: { student_id: id }, orderBy: { created_at: "desc" } });
    res.json({ success: true, data: requests });
  }),
);

portalRouter.get(
  "/student/:id/document-requests/:request_id/download",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);
    // 404, not 403, for a request that exists but isn't this student's or
    // isn't approved yet — same "don't confirm existence to an ineligible
    // caller" discipline as the Resource Library.
    const request = await prisma.documentRequest.findFirst({
      where: { id: reqParam(req, "request_id"), student_id: id, status: "APPROVED" },
    });
    if (!request?.document_blob_key) throw notFound("Document not found or not yet approved");

    const url = await getSignedDownloadUrl(request.document_blob_key);
    res.json({ success: true, data: { url } });
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

// Phase 37 — live position of the vehicle(s) on the student's assigned
// route. A route can carry more than one vehicle in this schema, so this
// returns each vehicle's latest ping rather than assuming exactly one.
portalRouter.get(
  "/student/:id/vehicle-location",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);

    const transport = await prisma.studentTransport.findUnique({
      where: { student_id: id },
      include: { route: { select: { id: true, name: true, vehicles: { where: { is_active: true }, select: { id: true, vehicle_no: true } } } } },
    });
    if (!transport) {
      res.json({ success: true, data: { route_name: null, vehicles: [] } });
      return;
    }

    const vehicles = await Promise.all(
      transport.route.vehicles.map(async (v) => {
        const latest = await prisma.vehicleLocationPing.findFirst({ where: { vehicle_id: v.id }, orderBy: { recorded_at: "desc" } });
        return { vehicle_id: v.id, vehicle_no: v.vehicle_no, latest_ping: latest };
      }),
    );

    res.json({ success: true, data: { route_name: transport.route.name, vehicles } });
  }),
);

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
  allowIframeEmbed,
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

// Receipt/invoice PDFs — mirrors documents.routes.ts's staff-side
// /fee/receipt and /fee/invoice data-building exactly, just ownership-gated
// via assertAccess instead of a staff role, since the portal has no route
// into that STAFF_ONLY_ROLES-gated router at all.
portalRouter.get(
  "/fees/receipts/:payment_id",
  allowIframeEmbed,
  asyncHandler(async (req, res) => {
    const paymentId = reqParam(req, "payment_id");
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { invoice: { include: { student: { include: { current_class: true, current_section: true } } } } },
    });
    if (!payment) throw notFound("Payment not found");
    await assertAccess(req.user!.sub, req.user!.role, payment.invoice.student_id);

    const qr = await generateQrDataUrl(`receipt:${payment.id}`);
    const pdf = await renderDocument("FEE_RECEIPT", {
      receipt_no: payment.receipt_no ?? payment.id,
      date: payment.paid_at ?? payment.created_at,
      student: payment.invoice.student,
      items: [{ category: payment.invoice.category, description: payment.invoice.description, amount: payment.amount, fine: 0 }],
      total: payment.amount,
      payment_method: payment.gateway,
      transaction_id: payment.transaction_id,
      is_invoice: false,
      qr_code: qr,
    });
    sendPdf(res, pdf, `receipt-${payment.id}.pdf`, req.query.download === "true");
  }),
);

portalRouter.get(
  "/fees/invoices/:invoice_id/pdf",
  allowIframeEmbed,
  asyncHandler(async (req, res) => {
    const invoiceId = reqParam(req, "invoice_id");
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { student: { include: { current_class: true, current_section: true } } } });
    if (!invoice) throw notFound("Invoice not found");
    await assertAccess(req.user!.sub, req.user!.role, invoice.student_id);

    const pdf = await renderDocument("FEE_RECEIPT", {
      receipt_no: invoice.invoice_no ?? invoice.id,
      date: invoice.due_date,
      student: invoice.student,
      items: [{ category: invoice.category, description: invoice.description, amount: invoice.amount_due, fine: invoice.fine_amount }],
      total: invoice.amount_due + invoice.fine_amount,
      payment_method: "N/A",
      transaction_id: null,
      is_invoice: true,
    });
    sendPdf(res, pdf, `invoice-${invoice.id}.pdf`, req.query.download === "true");
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

    const { blobKey } = await uploadBuffer("bank-slips", req.file.originalname, req.file.buffer, req.file.mimetype);
    const updated = await prisma.payment.update({ where: { id }, data: { slip_blob_key: blobKey } });
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

// Phase 32 — complaints raised by the logged-in portal user directly (not
// scoped through a student_id — a guardian's complaint isn't necessarily
// about one specific child). Filtered by the caller's own User id, same as
// the staff-side surface in complaints.routes.ts; portal users never reach
// the manage-all view, matching how PORTAL_ROLES never had staff access.
portalRouter.get(
  "/complaints",
  asyncHandler(async (req, res) => {
    const complaints = await prisma.complaint.findMany({ where: { raised_by_user_id: req.user!.sub }, orderBy: { created_at: "desc" } });
    res.json({ success: true, data: complaints });
  }),
);

portalRouter.post(
  "/complaints",
  asyncHandler(async (req, res) => {
    const body = createComplaintSchema.parse(req.body);
    const complaint = await prisma.complaint.create({ data: { ...body, raised_by_user_id: req.user!.sub } });
    await notifyRoles(COMPLAINT_MANAGE_ROLES, {
      type: "COMPLAINT_FILED",
      title: "New complaint filed",
      body: complaint.description.slice(0, 140),
      link: "/complaints",
    });
    res.status(201).json({ success: true, data: complaint });
  }),
);

portalRouter.get(
  "/complaints/:id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const complaint = await prisma.complaint.findUnique({
      where: { id },
      include: { messages: { orderBy: { created_at: "asc" } } },
    });
    if (!complaint || complaint.raised_by_user_id !== req.user!.sub) throw notFound("Complaint not found");

    const senderIds = [...new Set(complaint.messages.map((m) => m.sender_user_id))];
    const senders = await prisma.user.findMany({ where: { id: { in: senderIds } }, select: { id: true, name_en: true } });
    const nameById = new Map(senders.map((s) => [s.id, s.name_en]));
    res.json({
      success: true,
      data: { ...complaint, messages: complaint.messages.map((m) => ({ ...m, sender_name: nameById.get(m.sender_user_id) ?? null })) },
    });
  }),
);

portalRouter.post(
  "/complaints/:id/messages",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.complaint.findUnique({ where: { id } });
    if (!existing || existing.raised_by_user_id !== req.user!.sub) throw notFound("Complaint not found");

    const body = createComplaintMessageSchema.parse(req.body);
    const message = await postComplaintMessage(id, req.user!.sub, body.message, req);
    res.status(201).json({ success: true, data: message });
  }),
);

// Phase 33 — only unbooked, future slots are listed; booking is wrapped in
// a transaction that re-checks is_booked before flipping it, so two
// guardians racing for the same slot can't both win it.
portalRouter.get(
  "/ptm-slots",
  asyncHandler(async (req, res) => {
    const query = req.query as { teacher_id?: string };
    const slots = await prisma.pTMSlot.findMany({
      where: { is_booked: false, date: { gte: new Date() }, ...(query.teacher_id && { teacher_id: query.teacher_id }) },
      include: { teacher: { select: { name_en: true } }, class: { select: { name_en: true } } },
      orderBy: { date: "asc" },
    });
    res.json({ success: true, data: slots });
  }),
);

// Phase 34 — student uploads their work back for an ASSIGNMENT-type
// resource. Re-checks eligibility with the same isResourceEligible() used
// for downloads (a student can't submit to a resource they can't see), not
// just a student_id ownership check. Resubmission always allowed; if the
// prior submission was already GRADED, a new upload resets it back to
// SUBMITTED/LATE and clears the grade — the teacher must re-grade.
portalRouter.post(
  "/student/:id/resources/:resource_id/submit",
  documentUpload.single("file"),
  verifyDocumentMagicBytes,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);
    if (!req.file) throw badRequest("A file is required");

    const student = await prisma.student.findUnique({ where: { id } });
    if (!student?.current_class_id) throw notFound("Resource not found");

    const resource = await prisma.teachingResource.findUnique({ where: { id: reqParam(req, "resource_id") } });
    if (!resource || resource.resource_type !== "ASSIGNMENT" || !isResourceEligible(resource, student.current_class_id, student.current_section_id)) {
      throw notFound("Resource not found");
    }

    const { blobKey } = await uploadBuffer("assignment-submissions", req.file.originalname, req.file.buffer, req.file.mimetype);
    const isLate = !!resource.due_date && new Date() > resource.due_date;

    const submission = await prisma.assignmentSubmission.upsert({
      where: { resource_id_student_id: { resource_id: resource.id, student_id: id } },
      create: {
        resource_id: resource.id,
        student_id: id,
        blob_key: blobKey,
        original_filename: req.file.originalname,
        status: isLate ? "LATE" : "SUBMITTED",
      },
      update: {
        blob_key: blobKey,
        original_filename: req.file.originalname,
        submitted_at: new Date(),
        status: isLate ? "LATE" : "SUBMITTED",
        grade: null,
        feedback: null,
        graded_by_id: null,
      },
    });
    res.status(201).json({ success: true, data: submission });
  }),
);

portalRouter.get(
  "/student/:id/resources/:resource_id/submission",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await assertAccess(req.user!.sub, req.user!.role, id);
    const submission = await prisma.assignmentSubmission.findUnique({
      where: { resource_id_student_id: { resource_id: reqParam(req, "resource_id"), student_id: id } },
    });
    res.json({ success: true, data: submission });
  }),
);

portalRouter.post(
  "/ptm-slots/:id/book",
  asyncHandler(async (req, res) => {
    const slotId = reqParam(req, "id");
    const body = ptmBookSchema.parse(req.body);
    await assertAccess(req.user!.sub, req.user!.role, body.student_id);

    const guardian = await prisma.guardian.findUnique({ where: { user_id: req.user!.sub } });
    if (!guardian) throw forbidden("Only guardians can book PTM slots");

    const booking = await prisma.$transaction(async (tx) => {
      const slot = await tx.pTMSlot.findUnique({ where: { id: slotId } });
      if (!slot) throw notFound("Slot not found");
      if (slot.is_booked) throw badRequest("This slot has already been booked");

      await tx.pTMSlot.update({ where: { id: slotId }, data: { is_booked: true } });
      return tx.pTMBooking.create({
        data: { slot_id: slotId, guardian_id: guardian.id, student_id: body.student_id, notes: body.notes },
      });
    });

    res.status(201).json({ success: true, data: booking });
  }),
);

// Phase 36 — quizzes/online exams. Score is always computed server-side
// from the quiz's actual correct_option values, never trusted from the
// client. An IN_PROGRESS attempt read past its deadline auto-finalizes
// right there (legacy stored duration_minutes but never enforced it at
// all) — a closed tab or dead connection can't leave an attempt stuck
// forever blocking the teacher's results view.
async function computeQuizScore(quizId: string, answers: Record<string, string>): Promise<number> {
  const quizQuestions = await prisma.quizQuestion.findMany({ where: { quiz_id: quizId }, include: { question: true } });
  let score = 0;
  for (const qq of quizQuestions) {
    if (answers[qq.question_id] === qq.question.correct_option) score += qq.question.marks;
  }
  return score;
}

async function finalizeExpiredAttempt(attempt: { id: string; status: string; answers: unknown }) {
  const score = await computeQuizScore(
    (await prisma.quizAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).quiz_id,
    (attempt.answers as Record<string, string> | null) ?? {},
  );
  return prisma.quizAttempt.update({ where: { id: attempt.id }, data: { status: "GRADED", submitted_at: new Date(), score } });
}

portalRouter.get(
  "/quizzes",
  asyncHandler(async (req, res) => {
    const query = req.query as { student_id?: string };
    const id = query.student_id;
    if (!id) throw badRequest("student_id is required");
    await assertAccess(req.user!.sub, req.user!.role, id);

    const student = await prisma.student.findUnique({ where: { id } });
    if (!student?.current_class_id) return res.json({ success: true, data: [] });

    const quizzes = await prisma.quiz.findMany({
      where: { is_published: true, subject: { class_id: student.current_class_id } },
      include: { subject: { select: { name_en: true } }, _count: { select: { questions: true } } },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: quizzes });
  }),
);

portalRouter.post(
  "/quizzes/:id/start",
  asyncHandler(async (req, res) => {
    const quizId = reqParam(req, "id");
    const body = z.object({ student_id: z.string().min(1) }).parse(req.body);
    await assertAccess(req.user!.sub, req.user!.role, body.student_id);

    const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz || !quiz.is_published) throw notFound("Quiz not found");

    const existing = await prisma.quizAttempt.findUnique({ where: { quiz_id_student_id: { quiz_id: quizId, student_id: body.student_id } } });
    if (existing) return res.json({ success: true, data: existing });

    const quizQuestions = await prisma.quizQuestion.findMany({ where: { quiz_id: quizId }, orderBy: { display_order: "asc" } });
    const questionIds = quizQuestions.map((qq) => qq.question_id);
    // Fisher-Yates shuffle — legacy shuffled question order per attempt too.
    for (let i = questionIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questionIds[i], questionIds[j]] = [questionIds[j]!, questionIds[i]!];
    }

    const attempt = await prisma.quizAttempt.create({
      data: { quiz_id: quizId, student_id: body.student_id, question_order: questionIds },
    });
    res.status(201).json({ success: true, data: attempt });
  }),
);

portalRouter.get(
  "/quizzes/:id/attempt",
  asyncHandler(async (req, res) => {
    const quizId = reqParam(req, "id");
    const query = req.query as { student_id?: string };
    if (!query.student_id) throw badRequest("student_id is required");
    await assertAccess(req.user!.sub, req.user!.role, query.student_id);

    const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) throw notFound("Quiz not found");

    let attempt = await prisma.quizAttempt.findUnique({ where: { quiz_id_student_id: { quiz_id: quizId, student_id: query.student_id } } });
    if (!attempt) throw notFound("Attempt not started");

    const deadline = attempt.started_at.getTime() + quiz.duration_minutes * 60 * 1000;
    if (attempt.status === "IN_PROGRESS" && Date.now() > deadline) {
      attempt = await finalizeExpiredAttempt(attempt);
    }

    const quizQuestions = await prisma.quizQuestion.findMany({ where: { quiz_id: quizId }, include: { question: true } });
    const byId = new Map(quizQuestions.map((qq) => [qq.question_id, qq.question]));
    const order = (attempt.question_order as string[]) ?? [];
    const stillInProgress = attempt.status === "IN_PROGRESS";

    const questions = order
      .map((qId) => byId.get(qId))
      .filter((q): q is NonNullable<typeof q> => !!q)
      .map((q) => ({
        id: q.id,
        question_text: q.question_text,
        options: q.options,
        marks: q.marks,
        // Never serialize the answer key while an attempt is still open —
        // same discipline as the Resource Library's eligibility re-check.
        ...(stillInProgress ? {} : { correct_option: q.correct_option }),
      }));

    res.json({
      success: true,
      data: {
        attempt: { id: attempt.id, status: attempt.status, started_at: attempt.started_at, submitted_at: attempt.submitted_at, score: attempt.score, answers: stillInProgress ? undefined : attempt.answers },
        deadline_at: new Date(deadline),
        questions,
      },
    });
  }),
);

portalRouter.put(
  "/quizzes/attempts/:id/flag",
  quizFlagLimiter,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = flagQuizAttemptSchema.parse(req.body);
    const attempt = await prisma.quizAttempt.findUnique({ where: { id } });
    if (!attempt) throw notFound("Attempt not found");
    await assertAccess(req.user!.sub, req.user!.role, attempt.student_id);

    const flags = Array.isArray(attempt.tamper_flags) ? (attempt.tamper_flags as { type: string; at: string }[]) : [];
    flags.push({ type: body.type, at: new Date().toISOString() });
    await prisma.quizAttempt.update({ where: { id }, data: { tamper_flags: flags } });
    res.status(204).send();
  }),
);

portalRouter.post(
  "/quizzes/attempts/:id/submit",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const attempt = await prisma.quizAttempt.findUnique({ where: { id } });
    if (!attempt) throw notFound("Attempt not found");
    await assertAccess(req.user!.sub, req.user!.role, attempt.student_id);
    if (attempt.status !== "IN_PROGRESS") throw badRequest("This attempt has already been submitted");

    const body = submitQuizAttemptSchema.parse(req.body);
    const quiz = await prisma.quiz.findUniqueOrThrow({ where: { id: attempt.quiz_id } });
    const deadline = attempt.started_at.getTime() + quiz.duration_minutes * 60 * 1000;
    const isLate = Date.now() > deadline;

    const score = await computeQuizScore(attempt.quiz_id, body.answers);
    const flags = Array.isArray(attempt.tamper_flags) ? (attempt.tamper_flags as { type: string; at: string }[]) : [];
    if (isLate) flags.push({ type: "LATE_SUBMISSION", at: new Date().toISOString() });

    const updated = await prisma.quizAttempt.update({
      where: { id },
      data: { answers: body.answers, status: "GRADED", submitted_at: new Date(), score, tamper_flags: flags },
    });
    res.json({ success: true, data: updated });
  }),
);
