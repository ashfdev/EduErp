import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { STAFF_ONLY_ROLES, DOCUMENT_REQUEST_REVIEW_ROLES } from "../../lib/roles";
import { badRequest, notFound } from "../../lib/errors";
import { renderDocument, renderDocumentBatch, renderSimpleReport, generateQrDataUrl } from "../../services/pdf.service";
import { computeClassResults } from "../results/results.routes";
import { uploadBuffer } from "../../services/storage.service";
import { rejectDocumentRequestSchema } from "@education-erp/validators";
import { logAudit } from "../../lib/audit-log";

export const documentsRouter = Router();
// Generates PDFs containing full personal/academic/financial data for any
// given id with no per-record ownership check — restricted to staff roles.
// STUDENT/GUARDIAN reach their own marksheet via the ownership-checked
// /api/portal/student/:id/results/:exam_id/marksheet route instead.
documentsRouter.use(authenticate, authorize(STAFF_ONLY_ROLES));

function sendPdf(res: import("express").Response, buffer: Buffer, filename: string, download: boolean) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${filename}"`);
  res.send(buffer);
}

async function getAcademicYearLabel(id?: string | null) {
  if (!id) return "";
  const year = await prisma.academicYear.findUnique({ where: { id } });
  return year?.label ?? "";
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

    const pdf = await renderDocument("TESTIMONIAL", {
      student,
      exam_name: latestExam?.name ?? "N/A",
      year: new Date().getFullYear(),
      leaving_date: req.query.leaving_date ?? new Date(),
      issue_date: new Date(),
    });
    sendPdf(res, pdf, `${student.student_uid}-testimonial.pdf`, download);
  }),
);

documentsRouter.get(
  "/student/:id/transfer-cert",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const download = req.query.download === "true";
    const student = await prisma.student.findFirst({ where: { id, deleted_at: null }, include: { current_class: true } });
    if (!student) throw notFound("Student not found");

    const tcCount = await prisma.student.count({ where: { status: "TRANSFERRED" } });
    const pdf = await renderDocument("TRANSFER_CERTIFICATE", {
      student,
      tc_number: `TC-${new Date().getFullYear()}-${String(tcCount + 1).padStart(4, "0")}`,
      issue_date: new Date(),
      leaving_date: req.query.leaving_date ?? new Date(),
      leaving_reason: req.query.reason ?? "N/A",
      conduct: "Good",
      last_exam_result: "N/A",
      remarks: "N/A",
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
    res.json({ success: true, data: updated });
  }),
);

// ───────────────────────── Exam Documents ─────────────────────────

documentsRouter.get(
  "/exam/:exam_id/admit-cards",
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const query = z.object({ class_id: z.string().min(1), section_id: z.string().optional(), download: z.string().optional() }).parse(req.query);

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw notFound("Exam not found");

    const students = await prisma.student.findMany({
      where: { current_class_id: query.class_id, current_section_id: query.section_id, deleted_at: null },
      include: { current_class: true, current_section: true },
      orderBy: { current_roll_no: "asc" },
    });
    if (!students.length) throw badRequest("No students found for the given class/section");

    const subjectConfigs = await prisma.examSubjectConfig.findMany({ where: { exam_id: examId }, include: { subject: true } });
    const academicYearLabel = await getAcademicYearLabel(exam.academic_year_id);

    const dataList = await Promise.all(
      students.map(async (student) => {
        const seatPlan = await prisma.examSeatPlan.findUnique({ where: { exam_id_student_id: { exam_id: examId, student_id: student.id } } });
        const schedule = subjectConfigs.map((sc) => ({
          date: exam.start_date,
          day: exam.start_date ? new Date(exam.start_date).toLocaleDateString("en-US", { weekday: "long" }) : "",
          subject_name: sc.subject.name_en,
          time: "10:00 AM - 1:00 PM",
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
      orderBy: [{ session_id: "asc" }, { hall_name: "asc" }, { seat_number: "asc" }],
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

// ───────────────────────── Result Documents ─────────────────────────

export async function buildMarksheetData(examId: string, studentId: string) {
  const [exam, student, entries] = await Promise.all([
    prisma.exam.findUnique({ where: { id: examId } }),
    prisma.student.findUnique({ where: { id: studentId }, include: { current_class: true, current_section: true } }),
    prisma.markEntry.findMany({ where: { exam_id: examId, student_id: studentId }, include: { subject: true } }),
  ]);
  if (!exam) throw notFound("Exam not found");
  if (!student) throw notFound("Student not found");

  const totalMarks = entries.reduce((sum, e) => sum + (e.marks_total ?? 0), 0);
  const hasFailed = entries.some((e) => e.grade_letter === "F" || e.is_absent);
  const totalGpa = entries.length ? Math.round((entries.reduce((s, e) => s + (e.grade_point ?? 0), 0) / entries.length) * 100) / 100 : 0;

  return {
    student,
    exam_name: exam.name,
    academic_year_label: await getAcademicYearLabel(exam.academic_year_id),
    subjects: entries.map((e) => ({
      name_en: e.subject.name_en,
      code: e.subject.code,
      full_marks: e.subject.full_marks,
      marks_theory: e.marks_theory,
      marks_practical: e.marks_practical,
      marks_total: e.is_absent ? null : e.marks_total,
      grade_letter: e.is_absent ? "Abs" : e.grade_letter,
      grade_point: e.grade_point,
    })),
    total_marks: totalMarks,
    total_gpa: totalGpa,
    overall_grade: hasFailed ? "F" : entries[0]?.grade_letter ?? "",
    has_failed: hasFailed,
    next_class_name: "",
  };
}

documentsRouter.get(
  "/result/:exam_id/marksheet/:student_id",
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const studentId = reqParam(req, "student_id");
    const data = await buildMarksheetData(examId, studentId);
    const pdf = await renderDocument("MARKSHEET", data as unknown as Record<string, unknown>);
    sendPdf(res, pdf, `marksheet-${data.student.student_uid}.pdf`, req.query.download === "true");
  }),
);

documentsRouter.get(
  "/result/:exam_id/report-card/:student_id",
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const studentId = reqParam(req, "student_id");
    const base = await buildMarksheetData(examId, studentId);

    const attendanceTotal = await prisma.attendanceRecord.count({ where: { person_id: studentId, person_type: "STUDENT" } });
    const attendancePresent = await prisma.attendanceRecord.count({ where: { person_id: studentId, person_type: "STUDENT", status: "PRESENT" } });

    const pdf = await renderDocument("REPORT_CARD", {
      student: base.student,
      exam_name: base.exam_name,
      academic_year_label: base.academic_year_label,
      subjects: base.subjects.map((s) => ({ ...s, remark: "" })),
      conduct_grade: "A",
      attendance: {
        total_days: attendanceTotal,
        present: attendancePresent,
        absent: attendanceTotal - attendancePresent,
        percentage: attendanceTotal ? Math.round((attendancePresent / attendanceTotal) * 1000) / 10 : 0,
      },
      overall_remarks: base.has_failed ? "Needs improvement" : "Good performance",
    } as unknown as Record<string, unknown>);
    sendPdf(res, pdf, `report-card-${base.student.student_uid}.pdf`, req.query.download === "true");
  }),
);

documentsRouter.get(
  "/result/:exam_id/marksheets/class/:class_id",
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    const students = await prisma.student.findMany({ where: { current_class_id: classId, deleted_at: null }, orderBy: { current_roll_no: "asc" } });
    if (!students.length) throw badRequest("No students found in this class");

    const dataList = await Promise.all(students.map((s) => buildMarksheetData(examId, s.id)));
    const pdf = await renderDocumentBatch("MARKSHEET", dataList as unknown as Record<string, unknown>[]);
    sendPdf(res, pdf, `marksheets-class-${classId}.pdf`, req.query.download === "true");
  }),
);

documentsRouter.get(
  "/result/:exam_id/tabulation/:class_id",
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    const [exam, classInfo, subjects, results] = await Promise.all([
      prisma.exam.findUnique({ where: { id: examId } }),
      prisma.class.findUnique({ where: { id: classId } }),
      prisma.subject.findMany({ where: { class_id: classId } }),
      computeClassResults(examId, classId),
    ]);
    if (!exam) throw notFound("Exam not found");

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
    const [exam, classInfo, subjectConfigs, students] = await Promise.all([
      prisma.exam.findUnique({ where: { id: examId } }),
      prisma.class.findUnique({ where: { id: classId } }),
      prisma.examSubjectConfig.findMany({ where: { exam_id: examId, subject: { class_id: classId } }, include: { subject: true } }),
      prisma.student.findMany({ where: { current_class_id: classId, deleted_at: null }, orderBy: { current_roll_no: "asc" } }),
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
    const [exam, classInfo, results] = await Promise.all([
      prisma.exam.findUnique({ where: { id: examId } }),
      prisma.class.findUnique({ where: { id: classId } }),
      computeClassResults(examId, classId),
    ]);
    if (!exam) throw notFound("Exam not found");

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

documentsRouter.get(
  "/fee/receipt/:payment_id",
  asyncHandler(async (req, res) => {
    const paymentId = reqParam(req, "payment_id");
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { invoice: { include: { student: { include: { current_class: true, current_section: true } } } } },
    });
    if (!payment) throw notFound("Payment not found");

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

documentsRouter.get(
  "/fee/invoice/:invoice_id",
  asyncHandler(async (req, res) => {
    const invoiceId = reqParam(req, "invoice_id");
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

documentsRouter.get(
  "/payroll/payslip/:payroll_record_id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "payroll_record_id");
    const record = await prisma.payrollRecord.findUnique({ where: { id }, include: { staff: true } });
    if (!record) throw notFound("Payroll record not found");

    const pdf = await renderDocument("PAYSLIP", {
      staff: record.staff,
      month: record.month,
      year: record.year,
      gross_salary: record.gross_salary,
      deductions: record.deductions,
      advance_deducted: record.advance_deducted,
      net_salary: record.net_salary,
      working_days: record.working_days,
      present_days: record.present_days,
    });
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
