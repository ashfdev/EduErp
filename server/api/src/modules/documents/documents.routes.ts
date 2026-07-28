import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { STAFF_ONLY_ROLES, DOCUMENT_REQUEST_REVIEW_ROLES, EXAM_MANAGE_ROLES, PAYROLL_MANAGE_ROLES } from "../../lib/roles";
import { resolveOwnStaffId } from "../../lib/own-staff";
import { buildPayslipData } from "../hr/payroll.routes";
import { computeSubjectWiseAttendance } from "../../utils/subject-attendance";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { renderDocument, renderDocumentBatch, renderSimpleReport, generateQrDataUrl } from "../../services/pdf.service";
import { computeClassResults } from "../results/results.routes";
import { calculatePositions, calculateStudentResult } from "../../utils/grading.engine";
import { uploadBuffer } from "../../services/storage.service";
import { rejectDocumentRequestSchema } from "@education-erp/validators";
import { logAudit } from "../../lib/audit-log";
import { allowIframeEmbed } from "../../middleware/allow-iframe";
import { createInAppNotification } from "../../services/in-app-notification.service";
import { syncOverdueInvoices } from "../fees/invoice-helpers";
import { checkAdmitCardClearance } from "../../lib/admit-card-clearance";
import type { UserRole } from "@education-erp/types";

export const documentsRouter = Router();
// Generates PDFs containing full personal/academic/financial data for any
// given id with no per-record ownership check — restricted to staff roles.
// STUDENT/GUARDIAN reach their own marksheet via the ownership-checked
// /api/portal/student/:id/results/:exam_id/marksheet route instead.
documentsRouter.use(authenticate, authorize(STAFF_ONLY_ROLES));

export function sendPdf(res: import("express").Response, buffer: Buffer, filename: string, download: boolean) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${filename}"`);
  res.send(buffer);
}

async function getAcademicYearLabel(id?: string | null) {
  if (!id) return "";
  const year = await prisma.academicYear.findUnique({ where: { id } });
  return year?.label ?? "";
}

// Matches the `banglaDate` Handlebars helper's own dd/mm/yyyy formatting
// exactly (pdf.service.ts) -- duplicated as a tiny plain function here rather
// than reaching into Handlebars, since this runs before a PDF render (and
// therefore before registerHelpers()) whenever only the draft JSON is being
// built, not a document.
function ddmmyyyy(date: unknown): string {
  if (!date) return "";
  const d = new Date(date as string | number | Date);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// The Testimonial/Transfer Certificate "Compose" step (item 14 of the owner's
// batch report) needs a starting draft with every merge field already
// resolved to real prose/values -- never raw {{mustache}} syntax -- so
// editing feels like editing a real document, not a template. Both the GET
// draft-fetch route and the legacy no-override GET generate route call this
// same builder, so the default PDF a caller gets without ever visiting the
// Compose step is byte-identical to before this feature existed.
function buildTestimonialDefaultBody(
  student: { name_en: string; father_name: string | null; current_roll_no: string | null; registration_no: string | null; admission_date: Date | null; cgpa: number | null },
  examName: string,
  year: number,
  leavingDate: unknown,
): string {
  const performanceLine = student.cgpa
    ? `He/She has completed the academic program with a Cumulative Grade Point Average (CGPA) of <strong>${student.cgpa}</strong>.`
    : `He/She has appeared in the <strong>${examName}</strong> Examination in <strong>${year}</strong> from this institution.`;
  return (
    `<p>This is to certify that <strong>${student.name_en}</strong>, son/daughter of <strong>${student.father_name ?? ""}</strong>, ` +
    `Roll No: <strong>${student.current_roll_no ?? ""}</strong>, Registration No: <strong>${student.registration_no ?? ""}</strong>, ` +
    `was a student of this institution from <strong>${ddmmyyyy(student.admission_date)}</strong> to <strong>${ddmmyyyy(leavingDate)}</strong>. ` +
    `${performanceLine} He/She bears good character and conduct. We wish him/her success in future.</p>`
  );
}

// Resolves a real "Result of Last Examination" value from the student's most
// recent exam with recorded marks, instead of the previously-hardcoded
// "N/A" -- same simple grade_point-average shape buildMarksheetData already
// uses, kept intentionally lightweight since this is only ever a starting
// default a staff member reviews/edits before generating, not itself a
// graded record.
async function resolveLastExamResult(studentId: string): Promise<string> {
  const latestExam = await prisma.exam.findFirst({ where: { mark_entries: { some: { student_id: studentId } } }, orderBy: { created_at: "desc" } });
  if (!latestExam) return "N/A";
  const entries = await prisma.markEntry.findMany({ where: { exam_id: latestExam.id, student_id: studentId } });
  if (!entries.length) return "N/A";
  if (entries.some((e) => e.grade_letter === "F" || e.is_absent)) return `Failed (${latestExam.name})`;
  const avgGpa = Math.round((entries.reduce((s, e) => s + (e.grade_point ?? 0), 0) / entries.length) * 100) / 100;
  return `GPA ${avgGpa} (${latestExam.name})`;
}

// ───────────────────────── Student Documents ─────────────────────────

documentsRouter.get(
  "/student/:id/id-card",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const download = req.query.download === "true";
    const student = await prisma.student.findFirst({
      where: { id, deleted_at: null },
      include: { current_class: true, current_section: true },
    });
    if (!student) throw notFound("Student not found");

    const activeYear = await prisma.academicYear.findFirst({ where: { is_active: true } });
    const pdf = await renderDocument("STUDENT_ID_CARD", { student, academic_year_label: activeYear?.label ?? "" }, { pageSize: "ID_CARD" });
    sendPdf(res, pdf, `${student.student_uid}-id-card.pdf`, download);
  }),
);

documentsRouter.get(
  "/student/:id/testimonial",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const download = req.query.download === "true";
    const student = await prisma.student.findFirst({ where: { id, deleted_at: null } });
    if (!student) throw notFound("Student not found");

    const latestExam = await prisma.exam.findFirst({ where: { mark_entries: { some: { student_id: id } } }, orderBy: { created_at: "desc" } });
    const leavingDate = req.query.leaving_date ?? new Date();

    const pdf = await renderDocument("TESTIMONIAL", {
      student,
      exam_name: latestExam?.name ?? "N/A",
      year: new Date().getFullYear(),
      leaving_date: leavingDate,
      issue_date: new Date(),
      body_html: buildTestimonialDefaultBody(student, latestExam?.name ?? "N/A", new Date().getFullYear(), leavingDate),
    });
    sendPdf(res, pdf, `${student.student_uid}-testimonial.pdf`, download);
  }),
);

// Compose-and-edit draft (Plan Fifteen, Phase K): returns the same default
// wording buildTestimonialDefaultBody() would otherwise bake straight into
// the PDF, as real editable HTML the admin RichTextEditor seeds itself with
// — every merge field already resolved to this specific student's real
// values, never raw {{mustache}} syntax.
documentsRouter.get(
  "/student/:id/testimonial/draft",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const student = await prisma.student.findFirst({ where: { id, deleted_at: null } });
    if (!student) throw notFound("Student not found");

    const latestExam = await prisma.exam.findFirst({ where: { mark_entries: { some: { student_id: id } } }, orderBy: { created_at: "desc" } });
    const leavingDate = new Date();

    res.json({
      success: true,
      data: {
        body_html: buildTestimonialDefaultBody(student, latestExam?.name ?? "N/A", leavingDate.getFullYear(), leavingDate),
        leaving_date: leavingDate.toISOString().slice(0, 10),
      },
    });
  }),
);

// Generates from the admin's own edited wording (Plan Fifteen, Phase K) —
// a per-generation override only, never mutating the underlying
// TESTIMONIAL DocumentTemplate, since different students' testimonials
// routinely need individually different wording.
documentsRouter.post(
  "/student/:id/testimonial",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const download = req.query.download === "true";
    const body = z.object({ body_html: z.string().min(1), leaving_date: z.coerce.date().optional() }).parse(req.body);
    const student = await prisma.student.findFirst({ where: { id, deleted_at: null } });
    if (!student) throw notFound("Student not found");

    const pdf = await renderDocument("TESTIMONIAL", {
      student,
      leaving_date: body.leaving_date ?? new Date(),
      issue_date: new Date(),
      body_html: body.body_html,
    });
    sendPdf(res, pdf, `${student.student_uid}-testimonial.pdf`, download);
  }),
);

// Real "Result of Last Examination"/"Character and Conduct"/"Remarks"
// defaults for the Transfer Certificate Compose step, resolved once and
// shared by both the legacy no-override GET route (byte-identical default
// output) and the new /draft route the frontend seeds its edit form from.
async function resolveTransferCertDefaults(studentId: string) {
  return {
    conduct: "Good",
    last_exam_result: await resolveLastExamResult(studentId),
    remarks: "N/A",
  };
}

documentsRouter.get(
  "/student/:id/transfer-cert",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const download = req.query.download === "true";
    const student = await prisma.student.findFirst({ where: { id, deleted_at: null }, include: { current_class: true } });
    if (!student) throw notFound("Student not found");

    const tcCount = await prisma.student.count({ where: { status: "TRANSFERRED" } });
    const defaults = await resolveTransferCertDefaults(id);
    const pdf = await renderDocument("TRANSFER_CERTIFICATE", {
      student,
      tc_number: `TC-${new Date().getFullYear()}-${String(tcCount + 1).padStart(4, "0")}`,
      issue_date: new Date(),
      leaving_date: req.query.leaving_date ?? new Date(),
      leaving_reason: req.query.reason ?? "N/A",
      ...defaults,
    });
    sendPdf(res, pdf, `${student.student_uid}-transfer-certificate.pdf`, download);
  }),
);

documentsRouter.get(
  "/student/:id/transfer-cert/draft",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const student = await prisma.student.findFirst({ where: { id, deleted_at: null } });
    if (!student) throw notFound("Student not found");

    const defaults = await resolveTransferCertDefaults(id);
    res.json({
      success: true,
      data: { ...defaults, leaving_reason: "N/A", leaving_date: new Date().toISOString().slice(0, 10) },
    });
  }),
);

documentsRouter.post(
  "/student/:id/transfer-cert",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const download = req.query.download === "true";
    const body = z
      .object({
        conduct: z.string().min(1),
        last_exam_result: z.string().min(1),
        remarks: z.string().min(1),
        leaving_reason: z.string().min(1),
        leaving_date: z.coerce.date().optional(),
      })
      .parse(req.body);
    const student = await prisma.student.findFirst({ where: { id, deleted_at: null }, include: { current_class: true } });
    if (!student) throw notFound("Student not found");

    const tcCount = await prisma.student.count({ where: { status: "TRANSFERRED" } });
    const pdf = await renderDocument("TRANSFER_CERTIFICATE", {
      student,
      tc_number: `TC-${new Date().getFullYear()}-${String(tcCount + 1).padStart(4, "0")}`,
      issue_date: new Date(),
      leaving_date: body.leaving_date ?? new Date(),
      leaving_reason: body.leaving_reason,
      conduct: body.conduct,
      last_exam_result: body.last_exam_result,
      remarks: body.remarks,
    });
    sendPdf(res, pdf, `${student.student_uid}-transfer-certificate.pdf`, download);
  }),
);

// ─────────────── Student-Initiated Document Requests ───────────────
// The TESTIMONIAL/TRANSFER_CERTIFICATE routes above are staff-triggered and
// ungated — this is the request→review→approve/reject layer a student or
// guardian actually goes through from the portal (portal.routes.ts submits
// the request; these routes review/decide it), mirroring LeaveRequest's
// submit→approve shape.

documentsRouter.get(
  "/requests",
  authorize(DOCUMENT_REQUEST_REVIEW_ROLES),
  asyncHandler(async (req, res) => {
    const requests = await prisma.documentRequest.findMany({
      where: { status: "PENDING" },
      include: {
        student: {
          select: {
            id: true, name_en: true, student_uid: true, cgpa: true, current_class_id: true, group_id: true,
            current_class: { select: { name_en: true } },
            current_section: { select: { name: true } },
          },
        },
      },
      orderBy: { created_at: "asc" },
    });

    // Context the reviewer needs to decide — computed here, not left for the
    // admin to look up separately in another module.
    const data = await Promise.all(
      requests.map(async (r) => {
        const invoices = await prisma.invoice.findMany({ where: { student_id: r.student_id }, select: { amount_due: true, fine_amount: true, amount_paid: true } });
        const outstanding_due = invoices.reduce((sum, inv) => sum + (inv.amount_due + inv.fine_amount - inv.amount_paid), 0);
        const latestResult = r.student.current_class_id
          ? await prisma.resultPublication.findFirst({
              where: { class_id: r.student.current_class_id, group_id: r.student.group_id },
              orderBy: { published_at: "desc" },
            })
          : null;
        return {
          ...r,
          context: {
            outstanding_due,
            latest_result_published: !!latestResult?.is_published,
          },
        };
      }),
    );
    res.json({ success: true, data });
  }),
);

documentsRouter.put(
  "/requests/:id/approve",
  authorize(DOCUMENT_REQUEST_REVIEW_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const request = await prisma.documentRequest.findFirst({ where: { id, status: "PENDING" } });
    if (!request) throw notFound("Request not found or already reviewed");

    const student = await prisma.student.findUnique({ where: { id: request.student_id }, include: { current_class: true } });
    if (!student) throw notFound("Student not found");

    let pdf: Buffer;
    if (request.doc_type === "TESTIMONIAL") {
      const latestExam = await prisma.exam.findFirst({ where: { mark_entries: { some: { student_id: student.id } } }, orderBy: { created_at: "desc" } });
      pdf = await renderDocument("TESTIMONIAL", {
        student,
        exam_name: latestExam?.name ?? "N/A",
        year: new Date().getFullYear(),
        leaving_date: new Date(),
        issue_date: new Date(),
      });
    } else {
      const tcCount = await prisma.student.count({ where: { status: "TRANSFERRED" } });
      pdf = await renderDocument("TRANSFER_CERTIFICATE", {
        student,
        tc_number: `TC-${new Date().getFullYear()}-${String(tcCount + 1).padStart(4, "0")}`,
        issue_date: new Date(),
        leaving_date: new Date(),
        leaving_reason: request.reason ?? "N/A",
        conduct: "Good",
        last_exam_result: "N/A",
        remarks: "N/A",
      });
    }

    const { blobKey } = await uploadBuffer("document-requests", `${student.student_uid}-${request.doc_type.toLowerCase()}.pdf`, pdf, "application/pdf");
    const updated = await prisma.documentRequest.update({
      where: { id },
      data: { status: "APPROVED", reviewed_by_id: req.user!.sub, reviewed_at: new Date(), document_blob_key: blobKey },
    });
    await logAudit("DOCUMENT_REQUEST_REVIEWED", { userId: req.user!.sub, targetType: "DocumentRequest", targetId: id, metadata: { decision: "APPROVED", doc_type: request.doc_type }, req });
    await createInAppNotification({
      userId: request.requested_by_user_id,
      type: "DOCUMENT_APPROVED",
      title: "Document request approved",
      body: `Your ${request.doc_type} request is ready to download`,
      link: "/document-requests",
    });
    res.json({ success: true, data: updated });
  }),
);

documentsRouter.put(
  "/requests/:id/reject",
  authorize(DOCUMENT_REQUEST_REVIEW_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = rejectDocumentRequestSchema.parse(req.body);
    const request = await prisma.documentRequest.findFirst({ where: { id, status: "PENDING" } });
    if (!request) throw notFound("Request not found or already reviewed");

    const updated = await prisma.documentRequest.update({
      where: { id },
      data: { status: "REJECTED", reviewed_by_id: req.user!.sub, reviewed_at: new Date(), rejection_reason: body.rejection_reason },
    });
    await logAudit("DOCUMENT_REQUEST_REVIEWED", { userId: req.user!.sub, targetType: "DocumentRequest", targetId: id, metadata: { decision: "REJECTED", doc_type: request.doc_type }, req });
    await createInAppNotification({
      userId: request.requested_by_user_id,
      type: "DOCUMENT_REJECTED",
      title: "Document request rejected",
      body: body.rejection_reason,
      link: "/document-requests",
    });
    res.json({ success: true, data: updated });
  }),
);

// ───────────────────────── Exam Documents ─────────────────────────

// Preview endpoint — JSON, not a PDF. Lets the Print Center show a real
// green/red breakdown per student *before* generating anything, so staff
// know who'll be skipped (and why) instead of finding out only from a
// silently-shorter PDF. Reuses the same shared clearance gate the batch
// generate route below now enforces.
documentsRouter.get(
  "/exam/:exam_id/admit-cards/status",
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const query = z.object({ class_id: z.string().min(1), section_id: z.string().optional() }).parse(req.query);

    const students = await prisma.student.findMany({
      where: { current_class_id: query.class_id, current_section_id: query.section_id, deleted_at: null },
      select: { id: true, name_en: true, student_uid: true, current_roll_no: true },
      orderBy: { current_roll_no: "asc" },
    });

    const statuses = await Promise.all(
      students.map(async (student) => ({
        student_id: student.id,
        name: student.name_en,
        student_uid: student.student_uid,
        roll_no: student.current_roll_no,
        clearance: await checkAdmitCardClearance(student.id, examId),
      })),
    );

    res.json({ success: true, data: statuses });
  }),
);

// Previously performed zero clearance checks — any STAFF_ONLY_ROLES member
// (even e.g. a Librarian or Transport Manager, via this router's blanket
// gate) could batch-print an admit card for a student who was blocked on
// the portal's own self-service download. Now runs every student through
// the same shared gate the portal enforces; a blocked student is skipped by
// default (reported via the /status preview above, not silently dropped
// with no trace), unless explicitly overridden by an EXAM_MANAGE_ROLES
// caller with a required reason — recorded as a persistent
// AdmitCardOverride row plus an audit-log entry, not just included quietly.
documentsRouter.get(
  "/exam/:exam_id/admit-cards",
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const query = z
      .object({
        class_id: z.string().min(1),
        section_id: z.string().optional(),
        download: z.string().optional(),
        override_student_ids: z.string().optional(),
        override_reason: z.string().optional(),
      })
      .parse(req.query);

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw notFound("Exam not found");

    const overrideStudentIds = new Set(
      (query.override_student_ids ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    if (overrideStudentIds.size > 0) {
      if (!query.override_reason?.trim()) throw badRequest("override_reason is required to include a blocked student");
      if (!EXAM_MANAGE_ROLES.includes(req.user!.role as UserRole)) throw forbidden("Only exam leadership can override a clearance block");
    }

    const students = await prisma.student.findMany({
      where: { current_class_id: query.class_id, current_section_id: query.section_id, deleted_at: null },
      include: { current_class: true, current_section: true },
      orderBy: { current_roll_no: "asc" },
    });
    if (!students.length) throw badRequest("No students found for the given class/section");

    const included: typeof students = [];
    const overridden: { student: (typeof students)[number]; clearance: Awaited<ReturnType<typeof checkAdmitCardClearance>> }[] = [];
    for (const student of students) {
      const clearance = await checkAdmitCardClearance(student.id, examId);
      if (clearance.all_clear) {
        included.push(student);
      } else if (overrideStudentIds.has(student.id)) {
        included.push(student);
        overridden.push({ student, clearance });
      }
      // else: silently skipped from this PDF — the /status endpoint above is
      // where "who and why" gets reported, matching this codebase's existing
      // skip-and-report (not fail-the-whole-batch) discipline.
    }
    if (!included.length) {
      throw badRequest("No students are currently cleared for an admit card in this class/section — check the status preview, or override specific blocked students if this is a genuine exception.");
    }

    for (const { student, clearance } of overridden) {
      const reason = query.override_reason!.trim();
      await prisma.admitCardOverride.create({
        data: {
          exam_id: examId,
          student_id: student.id,
          reason,
          overridden_by_id: req.user!.sub,
          due_amount_at_time: clearance.accounts.due_amount,
          fine_amount_at_time: clearance.library.fine_amount,
          exam_office_was_cleared: clearance.exam_office.clear,
        },
      });
      await logAudit("ADMIT_CARD_OVERRIDE", {
        userId: req.user!.sub,
        targetType: "Student",
        targetId: student.id,
        metadata: {
          exam_id: examId,
          reason,
          due_amount: clearance.accounts.due_amount,
          fine_amount: clearance.library.fine_amount,
          exam_office_was_cleared: clearance.exam_office.clear,
        },
        req,
      });
    }

    const subjectConfigs = await prisma.examSubjectConfig.findMany({ where: { exam_id: examId }, include: { subject: true } });
    const academicYearLabel = await getAcademicYearLabel(exam.academic_year_id);

    const dataList = await Promise.all(
      included.map(async (student) => {
        const seatPlan = await prisma.examSeatPlan.findUnique({
          where: { exam_id_student_id: { exam_id: examId, student_id: student.id } },
          include: { session: { select: { date: true, start_time: true, end_time: true } } },
        });
        // Real per-session date/time (Plan Six, Phase 83) when this
        // student's seat plan was generated by session-aware generation;
        // falls back to the exam's own start_date with no time shown for
        // older plans generated before sessions existed, rather than the
        // previously-hardcoded "10:00 AM - 1:00 PM" shown for every subject
        // regardless of when it was actually scheduled.
        const sessionDate = seatPlan?.session?.date ?? exam.start_date;
        const sessionTime = seatPlan?.session ? `${seatPlan.session.start_time} - ${seatPlan.session.end_time}` : "TBA";
        // Every student in a section sees only THEIR own subjects on the
        // admit card's printed schedule -- a shared (group_id: null)
        // subject applies to everyone, a group-scoped one only to students
        // in that same group. A single section can have mixed groups, so
        // this must be resolved per student, never once for the whole batch.
        // Also scope to the student's own class: subjectConfigs spans every
        // class the exam covers, and an ungrouped subject in a DIFFERENT
        // class (e.g. Class 10's Physics, which has no group defined at all
        // since Class 10 has no Groups) would otherwise pass the group check
        // and silently leak onto a Class 9 student's schedule too.
        const eligibleConfigs = subjectConfigs.filter(
          (sc) => sc.subject.class_id === student.current_class_id && (sc.subject.group_id === null || sc.subject.group_id === student.group_id),
        );
        const schedule = eligibleConfigs.map((sc) => ({
          date: sessionDate,
          day: sessionDate ? new Date(sessionDate).toLocaleDateString("en-US", { weekday: "long" }) : "",
          subject_name: sc.subject.name_en,
          time: sessionTime,
          hall: seatPlan?.hall_name ?? "TBA",
          seat_no: seatPlan?.seat_number ?? "TBA",
        }));
        return { student, exam_name: exam.name, academic_year_label: academicYearLabel, schedule };
      }),
    );

    const pdf = await renderDocumentBatch("ADMIT_CARD", dataList as unknown as Record<string, unknown>[]);
    sendPdf(res, pdf, `admit-cards-${query.class_id}.pdf`, query.download === "true");
  }),
);

documentsRouter.get(
  "/exam/:exam_id/seat-plan",
  allowIframeEmbed,
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw notFound("Exam not found");

    const plans = await prisma.examSeatPlan.findMany({
      where: { exam_id: examId },
      include: {
        session: { select: { label: true } },
        student: { select: { name_en: true, current_roll_no: true, student_uid: true, current_class: { select: { name_en: true } } } },
      },
      // Numeric row/seat columns, not the display string (which would sort
      // "Row 10" before "Row 3" alphabetically) -- falls back to hall_name
      // for a legacy/unassigned row with no hall_id.
      orderBy: [{ session_id: "asc" }, { hall_name: "asc" }, { row_number: "asc" }, { seat_in_row: "asc" }],
    });
    if (!plans.length) throw badRequest("No seat plan generated for this exam yet");

    const academicYearLabel = await getAcademicYearLabel(exam.academic_year_id);
    interface SeatRow {
      seat_number: string | null;
      roll_no: string;
      name_en: string;
      student_uid: string;
      class_name: string;
    }
    // Grouped by (session, hall), not hall alone — two different sessions
    // can legitimately reuse the same hall name (their students are never
    // in the room at the same time), so hall name alone would silently mix
    // two sessions' rosters under one heading.
    const hallsMap = new Map<string, { hall_name: string; session_label: string | null; seats: SeatRow[] }>();
    for (const p of plans) {
      const hallName = p.hall_name ?? "Unassigned";
      const sessionLabel = p.session?.label ?? null;
      const key = `${sessionLabel ?? ""}::${hallName}`;
      const hall = hallsMap.get(key) ?? { hall_name: hallName, session_label: sessionLabel, seats: [] };
      hall.seats.push({
        seat_number: p.seat_number,
        roll_no: p.student.current_roll_no ?? "",
        name_en: p.student.name_en,
        student_uid: p.student.student_uid,
        class_name: p.student.current_class?.name_en ?? "",
      });
      hallsMap.set(key, hall);
    }

    const pdf = await renderDocument("SEAT_PLAN", { exam_name: exam.name, academic_year_label: academicYearLabel, halls: [...hallsMap.values()] });
    sendPdf(res, pdf, `seat-plan-${examId}.pdf`, req.query.download === "true");
  }),
);

// ───────────────────────── Gate Pass Documents ─────────────────────────

documentsRouter.get(
  "/gatepass/:visitor_id/slip",
  asyncHandler(async (req, res) => {
    const visitorId = reqParam(req, "visitor_id");
    const visitor = await prisma.visitor.findUnique({
      where: { id: visitorId },
      include: {
        student: { select: { name_en: true, student_uid: true } },
        class: { select: { name_en: true } },
        section: { select: { name: true } },
      },
    });
    if (!visitor) throw notFound("Visitor record not found");

    const qr = await generateQrDataUrl(`visitor:${visitor.id}`);
    const pdf = await renderDocument("VISITOR_SLIP", {
      visitor_name: visitor.visitor_name,
      phone: visitor.phone,
      visitor_type: visitor.visitor_type,
      relation: visitor.relation,
      relation_type: visitor.relation_type,
      visiting_student_name: visitor.student?.name_en ?? null,
      visiting_student_uid: visitor.student?.student_uid ?? null,
      visiting_class_name: visitor.class?.name_en ?? null,
      visiting_section_name: visitor.section?.name ?? null,
      reason: visitor.reason,
      in_time: visitor.in_time.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      qr_code: qr,
    });
    sendPdf(res, pdf, `visitor-slip-${visitor.id}.pdf`, req.query.download === "true");
  }),
);

// ───────────────────────── Result Documents ─────────────────────────

export async function buildMarksheetData(examId: string, studentId: string) {
  const [exam, student, entries, display, subjectConfigs, markComponentConfigs, studentSubjectRowsAllYears, institutionConfig] = await Promise.all([
    prisma.exam.findUnique({ where: { id: examId }, include: { grading_scale: { include: { ranges: { orderBy: { display_order: "asc" } } } }, academic_year: true } }),
    prisma.student.findUnique({ where: { id: studentId }, include: { current_class: true, current_section: true } }),
    prisma.markEntry.findMany({ where: { exam_id: examId, student_id: studentId }, include: { subject: true } }),
    prisma.marksheetDisplaySettings.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } }),
    // Includes each subject's own class_id -- an exam can span multiple
    // classes (see the identical fix in the admit-card routes), and this
    // student's report card/marksheet must only ever draw from their own
    // class's configuration, never leak another class's subjects in.
    prisma.examSubjectConfig.findMany({ where: { exam_id: examId }, include: { subject: true }, orderBy: { subject: { created_at: "asc" } } }),
    prisma.examMarkComponent.findMany({ where: { exam_id: examId }, orderBy: { display_order: "asc" } }),
    prisma.studentSubject.findMany({ where: { student_id: studentId }, select: { subject_id: true, is_fourth_subject: true, academic_year_id: true } }),
    prisma.institutionConfig.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!exam) throw notFound("Exam not found");
  if (!student) throw notFound("Student not found");

  // This exam's own academic year, since enrollment/4th-subject designation
  // is scoped per year.
  const studentSubjectRows = studentSubjectRowsAllYears.filter((r) => r.academic_year_id === exam.academic_year_id);
  // The BD "4th subject" GPA bonus rule (see grading.engine.ts).
  const fourthSubjectId = studentSubjectRows.find((r) => r.is_fourth_subject)?.subject_id ?? null;
  // Ground truth for which subjects this student is actually enrolled in —
  // the same source the mark-entry grid already uses (StudentSubject) — so
  // the printed subject list reflects every subject the student is really
  // taking, with a blank ("--") row for one not yet graded, instead of
  // silently showing nothing at all for a subject (or the whole document)
  // until every mark happens to already be entered.
  const enrolledSubjectIds = new Set(studentSubjectRows.map((r) => r.subject_id));

  const studentResult = calculateStudentResult(
    entries.map((e) => ({
      subject_id: e.subject_id,
      subject_name: e.subject.name_en,
      is_optional: e.subject.is_optional,
      is_fourth_subject: e.subject_id === fourthSubjectId,
      marks_total: e.marks_total,
      is_absent: e.is_absent,
    })),
    exam.grading_scale?.ranges ?? [],
    institutionConfig?.fourth_subject_rule ?? false,
  );

  // Per-subject (Written/Practical) full/pass marks come from this exam's
  // own subject configuration, not the Subject's static defaults -- the
  // same values already used to grade the entry, and what the marksheet
  // table needs to render a Written/Practical row split.
  const configBySubject = new Map(subjectConfigs.map((c) => [c.subject_id, c]));
  const entryBySubject = new Map(entries.map((e) => [e.subject_id, e]));

  // This student's expected subject list: configured for this exam, scoped
  // to their own class, and actually enrolled in — union'd with anything
  // that already has a real MarkEntry (a genuinely entered mark must never
  // disappear from the printed document just because enrollment data
  // doesn't, or no longer, match perfectly).
  const expectedSubjectIds = subjectConfigs
    .filter((c) => c.subject.class_id === student.current_class_id && enrolledSubjectIds.has(c.subject_id))
    .map((c) => c.subject_id);
  const printedSubjectIds = [...new Set([...expectedSubjectIds, ...entries.map((e) => e.subject_id)])];

  // Named mark-composition breakdown -- when a subject's total was entered
  // via named, fixed-mark-value parts (Theory/MCQ/Practical/CT/Assignment/
  // Attendance, whatever the admin configured), show each one distinctly
  // instead of only the summed total. Grouped by subject since components
  // are configured per (exam, subject).
  const markComponentsBySubject = new Map<string, typeof markComponentConfigs>();
  for (const c of markComponentConfigs) {
    const list = markComponentsBySubject.get(c.subject_id) ?? [];
    list.push(c);
    markComponentsBySubject.set(c.subject_id, list);
  }

  // Total Marks stays the flat sum of every subject's raw marks (including
  // the 4th subject, if any) -- a plain informational tally, unaffected by
  // the GPA-specific bonus/exclusion rule below.
  const totalMarks = entries.reduce((sum, e) => sum + (e.marks_total ?? 0), 0);
  // has_failed/total_gpa come from the same engine every other result
  // surface uses (portal, results-by-class) -- correctly excludes a failing
  // 4th subject from causing an overall fail, instead of the old flat
  // "any entry is F" check, which wrongly failed a student over a subject
  // that BD's own GPA rule says can never fail the overall result.
  const hasFailed = studentResult.has_failed;
  const totalGpa = studentResult.total_gpa;

  // A real, honest overall remark -- never a hardcoded "Good performance"
  // regardless of how much has actually been graded. Reuses the exam's own
  // GradeRange.remarks (the same field the class-average line below already
  // reuses) instead of a fixed two-string binary, and is explicit about an
  // incomplete result rather than confidently praising one.
  const gradedEntries = entries.filter((e) => !e.is_absent && e.marks_total !== null);
  let overallRemarks: string;
  if (entries.length === 0) {
    overallRemarks = "Result Pending — marks not yet entered";
  } else if (gradedEntries.length < printedSubjectIds.length) {
    overallRemarks = `In Progress — ${gradedEntries.length} of ${printedSubjectIds.length} subject(s) graded so far`;
  } else if (hasFailed) {
    overallRemarks = "Needs Improvement";
  } else {
    const gradedFullMarks = gradedEntries.reduce((sum, e) => sum + (e.subject.full_marks ?? 0), 0);
    const gradedTotalMarks = gradedEntries.reduce((sum, e) => sum + (e.marks_total ?? 0), 0);
    const studentPercentage = gradedFullMarks > 0 ? Math.round((gradedTotalMarks / gradedFullMarks) * 10000) / 100 : null;
    const matchingRange =
      studentPercentage !== null
        ? (exam.grading_scale?.ranges ?? []).find((r) => studentPercentage >= r.min_marks && studentPercentage <= r.max_marks)
        : undefined;
    overallRemarks = matchingRange?.remarks || "Good Performance";
  }

  // A marks-range -> grade-letter -> GPA legend (Plan Fourteen, Phase L2),
  // sourced from the exam's own already-active grading scale -- a display
  // addition, not new grading logic.
  const gradingLegend = (exam.grading_scale?.ranges ?? []).map((r) => ({
    range: `${r.min_marks}-${r.max_marks}`,
    grade_letter: r.grade_letter,
    grade_point: r.grade_point,
  }));

  // Position/highest/average stats are a real per-class computation --
  // only run it when at least one relevant display toggle is actually on,
  // so a school that never enables these doesn't pay the extra query cost
  // on every marksheet print (Plan Fourteen, Phase L3).
  const needsPosition =
    display.show_position_in_class ||
    display.show_position_in_section ||
    display.show_highest_in_class ||
    display.show_highest_in_section ||
    display.show_average_position ||
    display.show_average_percentage ||
    display.show_average_marks ||
    display.show_average_grade_point;

  let position: {
    position_in_class: number | null;
    position_in_section: number | null;
    highest_in_class: number | null;
    highest_in_section: number | null;
    class_average_marks: number | null;
    class_average_gpa: number | null;
    class_average_percentage: number | null;
    average_remarks: string | null;
    standing_vs_average: string | null;
  } | null = null;

  if (needsPosition && student.current_class_id) {
    // Scopes automatically to this student's own group (Plan Fifteen, Phase
    // A) -- a Science student's Position-in-Class/Class-Average must never
    // be diluted by Commerce/Arts students taking entirely different
    // subjects. `undefined` for an ungrouped student is a no-op filter,
    // byte-identical to before this param existed.
    const classResults = await computeClassResults(examId, student.current_class_id, student.group_id ?? undefined);
    const positionByStudent = new Map(classResults.map((r) => [r.student.id, r.position]));
    const sectionResults = classResults.filter((r) => r.student.current_section_id === student.current_section_id);
    const sectionPositioned = calculatePositions(
      sectionResults.map((r) => ({ student_id: r.student.id, total_gpa: r.result.total_gpa, total_marks: r.total_marks })),
    );
    const sectionPositionByStudent = new Map(sectionPositioned.map((p) => [p.student_id, p.position]));

    const classAverageMarks = classResults.length
      ? Math.round((classResults.reduce((s, r) => s + r.total_marks, 0) / classResults.length) * 100) / 100
      : null;

    // Denominator for a class-average PERCENTAGE: this student's own subject
    // full-marks sum, the same approximation class_average_marks/GPA already
    // make (computeClassResults doesn't guarantee every student shares an
    // identical subject set, e.g. optional subjects) -- reasonable since a
    // student's own printed marksheet is naturally read against their own
    // subject load.
    const totalFullMarks = entries.reduce((sum, e) => sum + (e.subject.full_marks ?? 0), 0);
    const classAveragePercentage =
      classAverageMarks !== null && totalFullMarks > 0 ? Math.round((classAverageMarks / totalFullMarks) * 10000) / 100 : null;

    // A textual remark for the class's average performance, resolved by
    // matching classAveragePercentage against the exam's own active grading
    // scale (same ranges already used to grade every subject) -- reuses
    // GradeRange.remarks rather than inventing new grading logic.
    const matchingRange =
      classAveragePercentage !== null
        ? (exam.grading_scale?.ranges ?? []).find((r) => classAveragePercentage >= r.min_marks && classAveragePercentage <= r.max_marks)
        : undefined;

    let standingVsAverage: string | null = null;
    if (classAverageMarks !== null) {
      const diff = totalMarks - classAverageMarks;
      standingVsAverage = Math.abs(diff) < 0.01 ? "At Class Average" : diff > 0 ? "Above Class Average" : "Below Class Average";
    }

    position = {
      position_in_class: positionByStudent.get(studentId) ?? null,
      position_in_section: sectionPositionByStudent.get(studentId) ?? null,
      highest_in_class: classResults.length ? Math.max(...classResults.map((r) => r.total_marks)) : null,
      highest_in_section: sectionResults.length ? Math.max(...sectionResults.map((r) => r.total_marks)) : null,
      class_average_marks: classAverageMarks,
      class_average_gpa: classResults.length
        ? Math.round((classResults.reduce((s, r) => s + r.result.total_gpa, 0) / classResults.length) * 100) / 100
        : null,
      class_average_percentage: classAveragePercentage,
      average_remarks: matchingRange?.remarks ?? null,
      standing_vs_average: standingVsAverage,
    };
  }

  // Real subject-wise attendance (Plan Twelve), scoped to the exam's own
  // academic year -- gated the same way `needsPosition` is above, so a
  // school with attendance display off doesn't pay the extra query.
  // Previously only computed for REPORT_CARD even though
  // MarksheetDisplaySettings.show_attendance_info already existed and
  // defaults to true for MARKSHEET too -- a real, latent gap this closes.
  let attendance: { total_days: number; present: number; absent: number; percentage: number } | null = null;
  if (display.show_attendance_info) {
    const dateRange = { gte: exam.academic_year.start_date, lte: exam.academic_year.end_date };
    const summary = (await computeSubjectWiseAttendance(prisma, [studentId], dateRange)).get(studentId)!;
    attendance = {
      total_days: summary.overall.total,
      present: summary.overall.present,
      absent: summary.overall.total - summary.overall.present,
      percentage: summary.overall.total ? summary.overall.percentage : 0,
    };
  }

  return {
    student,
    exam_name: exam.name,
    academic_year_label: await getAcademicYearLabel(exam.academic_year_id),
    attendance,
    subjects: printedSubjectIds
      .map((subjectId) => {
        const config = configBySubject.get(subjectId);
        const e = entryBySubject.get(subjectId);
        // Subject metadata comes from whichever source has it -- the exam's
        // own subject config normally, falling back to the MarkEntry's own
        // included subject for the rare straggler entry outside the exam's
        // configured list (see printedSubjectIds above).
        const subjectMeta = config?.subject ?? e?.subject;
        if (!subjectMeta) return null;

        // Named mark-composition breakdown — how this subject's full marks
        // are actually split (e.g. Theory/70 + MCQ/30). Shown as soon as the
        // exam defines these parts for the subject, even before any marks
        // are entered — a parent should be able to see WHAT a subject is
        // graded on, not just the eventual total. Each part's own value
        // comes straight from the stored component_values (a plain peer
        // value, no derived/scaled piece); "--" (via formatMarks) until a
        // real entry exists or for an absent student.
        const markComponentsForSubject = markComponentsBySubject.get(subjectId);
        const enteredComponentValues = e?.component_values as Record<string, { value: number | null; is_override: boolean }> | null | undefined;
        const markComponents = markComponentsForSubject
          ? markComponentsForSubject.map((c) => ({
              label: c.label,
              marks: e && !e.is_absent ? (enteredComponentValues?.[c.key]?.value ?? null) : null,
              max_marks: c.max_marks,
            }))
          : [];

        return {
          name_en: subjectMeta.name_en,
          code: subjectMeta.code,
          full_marks: subjectMeta.full_marks,
          pass_marks: subjectMeta.pass_marks,
          full_marks_theory: config?.full_marks_theory ?? subjectMeta.full_marks,
          full_marks_practical: config?.full_marks_practical ?? 0,
          pass_marks_theory: config?.pass_marks_theory ?? subjectMeta.pass_marks,
          pass_marks_practical: config?.pass_marks_practical ?? 0,
          has_practical: (config?.full_marks_practical ?? 0) > 0,
          // No entry yet -- every mark field renders as "--" (formatMarks),
          // never a silently-omitted row.
          marks_theory: e?.marks_theory ?? null,
          marks_practical: e?.marks_practical ?? null,
          marks_total: e ? (e.is_absent ? null : e.marks_total) : null,
          grade_letter: e ? (e.is_absent ? "Abs" : e.grade_letter) : null,
          grade_point: e?.grade_point ?? null,
          has_mark_components: markComponents.length > 0,
          mark_components: markComponents,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null),
    total_marks: totalMarks,
    total_gpa: totalGpa,
    // Was previously just the first subject's own grade letter -- unrelated
    // to the actual overall GPA. Now the real GPA-derived letter, same as
    // every other result surface.
    overall_grade: studentResult.overall_grade_letter,
    has_failed: hasFailed,
    overall_remarks: overallRemarks,
    next_class_name: "",
    display,
    grading_legend: gradingLegend,
    position,
    published_date: new Date(),
  };
}

documentsRouter.get(
  "/result/:exam_id/marksheet/:student_id",
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const studentId = reqParam(req, "student_id");
    const data = await buildMarksheetData(examId, studentId);
    const qrCode = data.display.show_qr_code ? await generateQrDataUrl(`marksheet:${examId}:${studentId}`) : undefined;
    const pdf = await renderDocument("MARKSHEET", { ...data, qr_code: qrCode } as unknown as Record<string, unknown>);
    sendPdf(res, pdf, `marksheet-${data.student.student_uid}.pdf`, req.query.download === "true");
  }),
);

documentsRouter.get(
  "/result/:exam_id/report-card/:student_id",
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const studentId = reqParam(req, "student_id");
    const base = await buildMarksheetData(examId, studentId);

    // Real subject-wise attendance (Plan Twelve), scoped to the exam's own
    // academic year — the old blanket AttendanceRecord count was neither
    // subject-wise nor scoped to any year at all.
    const exam = await prisma.exam.findUnique({ where: { id: examId }, include: { academic_year: true } });
    const dateRange = exam ? { gte: exam.academic_year.start_date, lte: exam.academic_year.end_date } : undefined;
    const attendanceSummary = (await computeSubjectWiseAttendance(prisma, [studentId], dateRange)).get(studentId)!;
    const qrCode = base.display.show_qr_code ? await generateQrDataUrl(`report-card:${examId}:${studentId}`) : undefined;

    const pdf = await renderDocument("REPORT_CARD", {
      student: base.student,
      exam_name: base.exam_name,
      academic_year_label: base.academic_year_label,
      subjects: base.subjects.map((s) => ({ ...s, remark: "" })),
      conduct_grade: "A",
      attendance: {
        total_days: attendanceSummary.overall.total,
        present: attendanceSummary.overall.present,
        absent: attendanceSummary.overall.total - attendanceSummary.overall.present,
        percentage: attendanceSummary.overall.total ? attendanceSummary.overall.percentage : 0,
      },
      overall_remarks: base.overall_remarks,
      display: base.display,
      grading_legend: base.grading_legend,
      position: base.position,
      published_date: base.published_date,
      qr_code: qrCode,
    } as unknown as Record<string, unknown>);
    sendPdf(res, pdf, `report-card-${base.student.student_uid}.pdf`, req.query.download === "true");
  }),
);

documentsRouter.get(
  "/result/:exam_id/marksheets/class/:class_id",
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    const groupId = typeof req.query.group_id === "string" ? req.query.group_id : undefined;
    const sectionId = typeof req.query.section_id === "string" ? req.query.section_id : undefined;
    // Each student's own marksheet is already correctly self-scoped by
    // buildMarksheetData (its position/average stats key off the student's
    // own group_id) -- this filter is purely about which students end up in
    // the batch at all, e.g. printing only one section's (and/or one
    // group's) marksheets instead of the whole (possibly multi-section,
    // multi-group) class every time. Section and Group are independent
    // axes and both narrow together -- a section can have mixed groups.
    const students = await prisma.student.findMany({
      where: {
        current_class_id: classId,
        deleted_at: null,
        ...(groupId && { group_id: groupId }),
        ...(sectionId && { current_section_id: sectionId }),
      },
      orderBy: { current_roll_no: "asc" },
    });
    if (!students.length) throw badRequest("No students found in this class");

    const dataList = await Promise.all(
      students.map(async (s) => {
        const data = await buildMarksheetData(examId, s.id);
        const qrCode = data.display.show_qr_code ? await generateQrDataUrl(`marksheet:${examId}:${s.id}`) : undefined;
        return { ...data, qr_code: qrCode };
      }),
    );
    const pdf = await renderDocumentBatch("MARKSHEET", dataList as unknown as Record<string, unknown>[]);
    sendPdf(res, pdf, `marksheets-class-${classId}.pdf`, req.query.download === "true");
  }),
);

documentsRouter.get(
  "/result/:exam_id/tabulation/:class_id",
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    const groupId = typeof req.query.group_id === "string" ? req.query.group_id : undefined;
    const sectionId = typeof req.query.section_id === "string" ? req.query.section_id : undefined;
    const [exam, classInfo, subjects, allResults] = await Promise.all([
      prisma.exam.findUnique({ where: { id: examId } }),
      prisma.class.findUnique({ where: { id: classId } }),
      // is_active: true -- a deactivated subject must never appear as a
      // column (or, worse, silently count as a required-but-untaken
      // subject for computeClassResults' own averaging below).
      prisma.subject.findMany({ where: { class_id: classId, is_active: true, ...(groupId && { OR: [{ group_id: null }, { group_id: groupId }] }) } }),
      computeClassResults(examId, classId, groupId),
    ]);
    if (!exam) throw notFound("Exam not found");
    // Section and Group are independent axes -- a section can have mixed
    // groups, so both narrow together rather than one replacing the other.
    const results = sectionId ? allResults.filter((r) => r.student.current_section_id === sectionId) : allResults;

    const rows = results
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((r, i) => ({
        sl: i + 1,
        roll_no: r.student.current_roll_no,
        name_en: r.student.name_en,
        marks: subjects.map((s) => r.result.subjects.find((rs) => rs.subject_id === s.id)?.marks_total ?? null),
        total_gpa: r.result.total_gpa,
        overall_grade: r.result.overall_grade_letter,
        position: r.position,
      }));

    const passed = results.filter((r) => !r.result.has_failed).length;
    const pdf = await renderDocument("TABULATION_SHEET", {
      exam_name: exam.name,
      class_name: classInfo?.name_en ?? "",
      academic_year_label: await getAcademicYearLabel(exam.academic_year_id),
      subject_names: subjects.map((s) => s.name_en),
      rows,
      total_appeared: results.length,
      total_passed: passed,
      pass_rate: results.length ? Math.round((passed / results.length) * 1000) / 10 : 0,
    }, { pageSize: "A3", orientation: "landscape" });
    sendPdf(res, pdf, `tabulation-${classId}.pdf`, req.query.download === "true");
  }),
);

documentsRouter.get(
  "/result/:exam_id/blank-marksheet/:class_id",
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    const groupId = typeof req.query.group_id === "string" ? req.query.group_id : undefined;
    const sectionId = typeof req.query.section_id === "string" ? req.query.section_id : undefined;
    const [exam, classInfo, subjectConfigs, students] = await Promise.all([
      prisma.exam.findUnique({ where: { id: examId } }),
      prisma.class.findUnique({ where: { id: classId } }),
      prisma.examSubjectConfig.findMany({
        where: { exam_id: examId, subject: { class_id: classId, is_active: true, ...(groupId && { OR: [{ group_id: null }, { group_id: groupId }] }) } },
        include: { subject: true },
      }),
      prisma.student.findMany({
        where: {
          current_class_id: classId,
          deleted_at: null,
          ...(groupId && { group_id: groupId }),
          ...(sectionId && { current_section_id: sectionId }),
        },
        orderBy: { current_roll_no: "asc" },
      }),
    ]);
    if (!exam) throw notFound("Exam not found");
    if (!subjectConfigs.length) throw badRequest("No subjects configured for this exam/class");

    const pdf = await renderDocument(
      "BLANK_MARKSHEET",
      {
        exam_name: exam.name,
        class_name: classInfo?.name_en ?? "",
        academic_year_label: await getAcademicYearLabel(exam.academic_year_id),
        subjects: subjectConfigs.map((c) => ({ name_en: c.subject.name_en, full_marks: c.full_marks_theory + c.full_marks_practical })),
        students: students.map((s, i) => ({ sl: i + 1, roll_no: s.current_roll_no, name_en: s.name_en })),
      },
      { pageSize: "A3", orientation: "landscape" },
    );
    sendPdf(res, pdf, `blank-marksheet-${classId}.pdf`, req.query.download === "true");
  }),
);

documentsRouter.get(
  "/result/:exam_id/merit-list/:class_id",
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    const groupId = typeof req.query.group_id === "string" ? req.query.group_id : undefined;
    const sectionId = typeof req.query.section_id === "string" ? req.query.section_id : undefined;
    const [exam, classInfo, allResults] = await Promise.all([
      prisma.exam.findUnique({ where: { id: examId } }),
      prisma.class.findUnique({ where: { id: classId } }),
      computeClassResults(examId, classId, groupId),
    ]);
    if (!exam) throw notFound("Exam not found");
    const results = sectionId ? allResults.filter((r) => r.student.current_section_id === sectionId) : allResults;

    const rows = results
      .filter((r) => !r.result.has_failed)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((r) => ({ rank: r.position, roll_no: r.student.current_roll_no, student_uid: r.student.student_uid, name_en: r.student.name_en, total_gpa: r.result.total_gpa }));

    const pdf = await renderDocument("MERIT_LIST", {
      exam_name: exam.name,
      class_name: classInfo?.name_en ?? "",
      academic_year_label: await getAcademicYearLabel(exam.academic_year_id),
      rows,
    });
    sendPdf(res, pdf, `merit-list-${classId}.pdf`, req.query.download === "true");
  }),
);

// ───────────────────────── Attendance Documents ─────────────────────────

documentsRouter.get(
  "/attendance/daily-register",
  asyncHandler(async (req, res) => {
    const query = z.object({ date: z.string().min(1), class_id: z.string().min(1), section_id: z.string().optional() }).parse(req.query);
    const students = await prisma.student.findMany({
      where: { current_class_id: query.class_id, current_section_id: query.section_id, deleted_at: null },
      orderBy: { current_roll_no: "asc" },
    });
    const date = new Date(query.date);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    const records = await prisma.attendanceRecord.findMany({
      where: { person_type: "STUDENT", person_id: { in: students.map((s) => s.id) }, date: { gte: dayStart, lt: dayEnd } },
    });

    const rows = students
      .map((s, i) => {
        const rec = records.find((r) => r.person_id === s.id);
        return `<tr><td>${i + 1}</td><td>${s.current_roll_no ?? ""}</td><td style="text-align:left">${s.name_en}</td><td>${rec?.status ?? "-"}</td></tr>`;
      })
      .join("");
    const html = `<table><thead><tr><th>SL</th><th>Roll</th><th>Name</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
    const pdf = await renderSimpleReport(`Daily Attendance Register — ${query.date}`, html);
    sendPdf(res, pdf, "daily-register.pdf", req.query.download === "true");
  }),
);

documentsRouter.get(
  "/attendance/monthly-sheet",
  asyncHandler(async (req, res) => {
    const query = z
      .object({ class_id: z.string().min(1), section_id: z.string().optional(), month: z.coerce.number().int().min(1).max(12), year: z.coerce.number().int() })
      .parse(req.query);

    const students = await prisma.student.findMany({
      where: { current_class_id: query.class_id, current_section_id: query.section_id, deleted_at: null },
      orderBy: { current_roll_no: "asc" },
    });
    const monthStart = new Date(query.year, query.month - 1, 1);
    const monthEnd = new Date(query.year, query.month, 1);
    const daysInMonth = new Date(query.year, query.month, 0).getDate();
    const dates = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const records = await prisma.attendanceRecord.findMany({
      where: { person_type: "STUDENT", person_id: { in: students.map((s) => s.id) }, date: { gte: monthStart, lt: monthEnd } },
    });

    const rows = students.map((s, i) => {
      const studentRecords = records.filter((r) => r.person_id === s.id);
      const marks = dates.map((d) => {
        const rec = studentRecords.find((r) => new Date(r.date).getDate() === d);
        return rec ? rec.status[0] : "";
      });
      const present = studentRecords.filter((r) => r.status === "PRESENT").length;
      return { sl: i + 1, roll_no: s.current_roll_no, name_en: s.name_en, marks, present, absent: studentRecords.length - present, percentage: studentRecords.length ? Math.round((present / studentRecords.length) * 1000) / 10 : 0 };
    });

    const classInfo = await prisma.class.findUnique({ where: { id: query.class_id } });
    const sectionInfo = query.section_id ? await prisma.section.findUnique({ where: { id: query.section_id } }) : null;
    const pdf = await renderDocument("ATTENDANCE_SHEET", {
      class_name: classInfo?.name_en ?? "",
      section_name: sectionInfo?.name ?? "",
      month: query.month,
      year: query.year,
      dates,
      rows,
    });
    sendPdf(res, pdf, `attendance-monthly-${query.month}-${query.year}.pdf`, req.query.download === "true");
  }),
);

documentsRouter.get(
  "/attendance/blank-sheet",
  asyncHandler(async (req, res) => {
    const query = z
      .object({ class_id: z.string().min(1), section_id: z.string().optional(), from_date: z.string().min(1), to_date: z.string().min(1) })
      .parse(req.query);

    const students = await prisma.student.findMany({
      where: { current_class_id: query.class_id, current_section_id: query.section_id, deleted_at: null },
      orderBy: { current_roll_no: "asc" },
    });
    const from = new Date(query.from_date);
    const to = new Date(query.to_date);
    const dateColumns: number[] = [];
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) dateColumns.push(d.getDate());

    const classInfo = await prisma.class.findUnique({ where: { id: query.class_id } });
    const sectionInfo = query.section_id ? await prisma.section.findUnique({ where: { id: query.section_id } }) : null;

    const pdf = await renderDocument("ATTENDANCE_BLANK", {
      class_name: classInfo?.name_en ?? "",
      section_name: sectionInfo?.name ?? "",
      shift_name: "",
      from_date: query.from_date,
      to_date: query.to_date,
      date_columns: dateColumns,
      students: students.map((s, i) => ({ sl: i + 1, roll_no: s.current_roll_no, name_en: s.name_en })),
    });
    sendPdf(res, pdf, "attendance-blank.pdf", req.query.download === "true");
  }),
);

// ───────────────────────── Finance Documents ─────────────────────────

function receiptCopyLabel(copy: unknown): string | undefined {
  if (copy === "admin") return "Admin Copy";
  if (copy === "student") return "Student Copy";
  return undefined;
}

documentsRouter.get(
  "/fee/receipt/:payment_id",
  allowIframeEmbed,
  asyncHandler(async (req, res) => {
    const paymentId = reqParam(req, "payment_id");
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { invoice: { include: { student: { include: { current_class: true, current_section: true } } } } },
    });
    if (!payment) throw notFound("Payment not found");

    const invoiceOutstanding = Math.max(0, payment.invoice.amount_due + payment.invoice.fine_amount - payment.invoice.amount_paid);
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
      // A receipt always documents a completed payment (this route is only
      // ever reached once a Payment is COMPLETED) -- the stamp is always
      // "PAID" for the transaction itself. invoice_status/
      // invoice_outstanding separately show whether the underlying invoice
      // this payment applied to is now fully settled or still has a
      // remaining balance (a receipt can document a partial payment).
      invoice_status: payment.invoice.status,
      invoice_outstanding: invoiceOutstanding,
      qr_code: qr,
      copy_label: receiptCopyLabel(req.query.copy),
    });
    sendPdf(res, pdf, `receipt-${payment.id}.pdf`, req.query.download === "true");
  }),
);

// A batch "Receive Fee" submission (Plan Fourteen, Phase N4) creates one
// Payment row per invoice line, each keeping its own unique receipt_no for
// accounting -- but the parent/guardian expects ONE printed receipt for
// the whole transaction, not one per line. This route renders exactly
// that: every payment sharing a receipt_batch_id, combined into one
// document under the FIRST payment's receipt_no, with a per-line
// Particulars row and one grand total -- reusing the exact same
// FEE_RECEIPT template/items[] shape the single-payment route above
// already uses, just with more than one row.
documentsRouter.get(
  "/fee/receipt/batch/:receipt_batch_id",
  allowIframeEmbed,
  asyncHandler(async (req, res) => {
    const batchId = reqParam(req, "receipt_batch_id");
    const payments = await prisma.payment.findMany({
      where: { receipt_batch_id: batchId },
      include: { invoice: { include: { student: { include: { current_class: true, current_section: true } } } } },
      orderBy: { created_at: "asc" },
    });
    if (!payments.length) throw notFound("Receipt batch not found");
    const first = payments[0]!;

    // A batch can cover several invoices at once (e.g. a fee + a fine paid
    // together) -- "PAID" only if every one of them is now fully settled;
    // otherwise "PARTIAL" with the combined remaining balance, same logic
    // as the single-receipt route above just summed across every line's
    // own invoice.
    const uniqueInvoices = new Map(payments.map((p) => [p.invoice.id, p.invoice]));
    const allInvoicesPaid = [...uniqueInvoices.values()].every((inv) => inv.status === "PAID" || inv.status === "WAIVED");
    const combinedOutstanding = [...uniqueInvoices.values()].reduce((sum, inv) => sum + Math.max(0, inv.amount_due + inv.fine_amount - inv.amount_paid), 0);

    const qr = await generateQrDataUrl(`receipt-batch:${batchId}`);
    const pdf = await renderDocument("FEE_RECEIPT", {
      receipt_no: first.receipt_no ?? first.id,
      date: first.paid_at ?? first.created_at,
      student: first.invoice.student,
      items: payments.map((p) => ({ category: p.invoice.category, description: p.invoice.description, amount: p.amount, fine: 0 })),
      total: payments.reduce((sum, p) => sum + p.amount, 0),
      payment_method: first.gateway,
      transaction_id: first.transaction_id,
      is_invoice: false,
      invoice_status: allInvoicesPaid ? "PAID" : "PARTIAL",
      invoice_outstanding: combinedOutstanding,
      qr_code: qr,
      copy_label: receiptCopyLabel(req.query.copy),
    });
    sendPdf(res, pdf, `receipt-${first.receipt_no ?? batchId}.pdf`, req.query.download === "true");
  }),
);

documentsRouter.get(
  "/fee/invoice/:invoice_id",
  allowIframeEmbed,
  asyncHandler(async (req, res) => {
    const invoiceId = reqParam(req, "invoice_id");
    const existing = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { student_id: true } });
    if (!existing) throw notFound("Invoice not found");
    await syncOverdueInvoices(prisma, existing.student_id);
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { student: { include: { current_class: true, current_section: true } } } });
    if (!invoice) throw notFound("Invoice not found");

    const pdf = await renderDocument("FEE_RECEIPT", {
      receipt_no: invoice.invoice_no ?? invoice.id,
      date: invoice.due_date,
      student: invoice.student,
      items: [{ category: invoice.category, description: invoice.description, amount: invoice.amount_due, fine: invoice.fine_amount }],
      total: invoice.amount_due + invoice.fine_amount,
      payment_method: "N/A",
      transaction_id: null,
      is_invoice: true,
      invoice_status: invoice.status,
      invoice_outstanding: Math.max(0, invoice.amount_due + invoice.fine_amount - invoice.amount_paid),
    });
    sendPdf(res, pdf, `invoice-${invoice.id}.pdf`, req.query.download === "true");
  }),
);

documentsRouter.get(
  "/fee/dues-report",
  asyncHandler(async (req, res) => {
    const query = z.object({ class_id: z.string().optional(), status: z.string().optional() }).parse(req.query);
    const invoices = await prisma.invoice.findMany({
      where: {
        ...(query.class_id && { student: { current_class_id: query.class_id } }),
        status: (query.status as never) ?? { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      },
      include: { student: true },
    });

    const rows = invoices
      .map((inv) => `<tr><td>${inv.student.name_en}</td><td>${inv.student.student_uid}</td><td>${inv.description}</td><td>৳${inv.amount_due - inv.amount_paid}</td><td>${inv.status}</td></tr>`)
      .join("");
    const html = `<table><thead><tr><th>Student</th><th>ID</th><th>Description</th><th>Due</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
    const pdf = await renderSimpleReport("Outstanding Dues Report", html);
    sendPdf(res, pdf, "dues-report.pdf", req.query.download === "true");
  }),
);

// Real, confirmed gap found during Plan Fourteen Phase J research: this
// route had no scoping beyond the router-level STAFF_ONLY_ROLES gate,
// letting any staff role (Librarian, Class Teacher, etc.) fetch any other
// employee's payslip PDF by ID. Now mirrors payroll.routes.ts's own
// (already-fixed) copy of this route exactly: PAYROLL_MANAGE_ROLES may
// fetch any record, everyone else only their own.
documentsRouter.get(
  "/payroll/payslip/:payroll_record_id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "payroll_record_id");
    const record = await prisma.payrollRecord.findUnique({ where: { id }, include: { staff: { include: { salary_structure: true } } } });
    if (!record) throw notFound("Payroll record not found");

    if (!PAYROLL_MANAGE_ROLES.includes(req.user!.role as UserRole)) {
      const ownStaffId = await resolveOwnStaffId(req.user!.sub);
      if (ownStaffId !== record.staff_id) throw notFound("Payroll record not found");
    }

    const pdf = await renderDocument("PAYSLIP", buildPayslipData(record) as unknown as Record<string, unknown>);
    sendPdf(res, pdf, `payslip-${record.staff.staff_uid}-${record.month}-${record.year}.pdf`, req.query.download === "true");
  }),
);

// ───────────────────────── ID Cards ─────────────────────────

documentsRouter.get(
  "/staff/:id/id-card",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const staff = await prisma.staff.findFirst({ where: { id, deleted_at: null }, include: { department: true } });
    if (!staff) throw notFound("Staff not found");
    const pdf = await renderDocument("STAFF_ID_CARD", { staff }, { pageSize: "ID_CARD" });
    sendPdf(res, pdf, `${staff.staff_uid}-id-card.pdf`, req.query.download === "true");
  }),
);

documentsRouter.get(
  "/id-cards/class/:class_id",
  asyncHandler(async (req, res) => {
    const classId = reqParam(req, "class_id");
    const students = await prisma.student.findMany({
      where: { current_class_id: classId, deleted_at: null },
      include: { current_class: true, current_section: true },
      orderBy: { current_roll_no: "asc" },
    });
    if (!students.length) throw badRequest("No students found in this class");

    const activeYear = await prisma.academicYear.findFirst({ where: { is_active: true } });
    const dataList = students.map((student) => ({ student, academic_year_label: activeYear?.label ?? "" }));
    const pdf = await renderDocumentBatch("STUDENT_ID_CARD", dataList, { pageSize: "ID_CARD" });
    sendPdf(res, pdf, `id-cards-class-${classId}.pdf`, req.query.download === "true");
  }),
);

documentsRouter.get(
  "/id-cards/all-staff",
  asyncHandler(async (req, res) => {
    const staffList = await prisma.staff.findMany({ where: { is_active: true, deleted_at: null }, include: { department: true } });
    if (!staffList.length) throw badRequest("No active staff found");
    const pdf = await renderDocumentBatch("STAFF_ID_CARD", staffList.map((staff) => ({ staff })), { pageSize: "ID_CARD" });
    sendPdf(res, pdf, "id-cards-all-staff.pdf", req.query.download === "true");
  }),
);

documentsRouter.get(
  "/student/:id/transport-card",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const student = await prisma.student.findFirst({ where: { id, deleted_at: null } });
    if (!student) throw notFound("Student not found");
    const transportRecord = await prisma.studentTransport.findUnique({ where: { student_id: id }, include: { route: { include: { vehicles: true } } } });
    if (!transportRecord) throw badRequest("This student has no transport allocation");

    const pdf = await renderDocument(
      "TRANSPORT_CARD",
      { student, transport: { route: transportRecord.route, vehicle_no: transportRecord.route.vehicles[0]?.vehicle_no ?? "" } },
      { pageSize: "ID_CARD" },
    );
    sendPdf(res, pdf, `${student.student_uid}-transport-card.pdf`, req.query.download === "true");
  }),
);

documentsRouter.get(
  "/student/:id/hostel-card",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const student = await prisma.student.findFirst({ where: { id, deleted_at: null } });
    if (!student) throw notFound("Student not found");
    const allocation = await prisma.hostelAllocation.findFirst({ where: { student_id: id, is_active: true }, include: { room: { include: { block: true } } } });
    if (!allocation) throw badRequest("This student has no active hostel allocation");

    const pdf = await renderDocument(
      "HOSTEL_CARD",
      { student, hostel: { room: allocation.room, bed_no: allocation.bed_no } },
      { pageSize: "ID_CARD" },
    );
    sendPdf(res, pdf, `${student.student_uid}-hostel-card.pdf`, req.query.download === "true");
  }),
);

documentsRouter.post(
  "/certificate",
  asyncHandler(async (req, res) => {
    const body = z.object({ recipient_name: z.string().min(1), issue_date: z.coerce.date().optional() }).parse(req.body);
    const pdf = await renderDocument(
      "CERTIFICATE",
      { recipient: { name: body.recipient_name }, issue_date: body.issue_date ?? new Date() },
      { pageSize: "A4" },
    );
    sendPdf(res, pdf, `certificate-${body.recipient_name.replace(/\s+/g, "_")}.pdf`, req.query.download === "true");
  }),
);
