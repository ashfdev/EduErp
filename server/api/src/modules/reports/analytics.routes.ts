import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { computeClassResults } from "../results/results.routes";
import { sendNotification } from "../../services/notification.service";
import { createInAppNotification } from "../../services/in-app-notification.service";
import { sendSms } from "../../services/sms.service";
import { reqParam } from "../../lib/req-param";
import { notFound, badRequest } from "../../lib/errors";
import { ANALYTICS_MESSAGE_ROLES, STAFF_ONLY_ROLES } from "../../lib/roles";
import { computeSubjectWiseAttendance } from "../../utils/subject-attendance";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const analyticsRouter = Router();
// Every route below this line lacked any authorize() at all (only
// `authenticate`), letting a STUDENT/GUARDIAN portal token pull
// institution-wide dashboards. This dashboard is meant for general staff
// use (not leadership-only) — STAFF_ONLY_ROLES is the correct floor; the
// stricter ANALYTICS_MESSAGE_ROLES on the at-risk/messaging routes below
// still applies on top of this and narrows further for those specific routes.
analyticsRouter.use(authenticate, authorize(STAFF_ONLY_ROLES));

function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start, end };
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

analyticsRouter.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    const { start: todayStart, end: todayEnd } = todayRange();
    const { start: monthStart, end: monthEnd } = monthRange();
    const now = new Date();

    const activeYear = await prisma.academicYear.findFirst({ where: { is_active: true } });
    const newThisYearWhere = activeYear
      ? { created_at: { gte: activeYear.start_date, lte: activeYear.end_date } }
      : { created_at: { gte: new Date(now.getFullYear(), 0, 1) } };

    const [
      studentsTotal, studentsActive, studentsNewThisYear,
      studentsPresentToday, studentsAbsentToday,
      staffTotal, staffActive, staffOnLeaveToday, staffPresentToday,
      todayPayments, monthPayments,
      outstandingInvoices,
      overdueInvoicesCount,
      activeExams, publishedResults, upcomingEvents,
      booksIssued, overdueIssues,
      latestPublishedExam,
    ] = await Promise.all([
      prisma.student.count({ where: { deleted_at: null } }),
      prisma.student.count({ where: { deleted_at: null, status: "ACTIVE" } }),
      prisma.student.count({ where: { deleted_at: null, ...newThisYearWhere } }),
      prisma.attendanceRecord.count({ where: { person_type: "STUDENT", date: { gte: todayStart, lt: todayEnd }, status: "PRESENT" } }),
      prisma.attendanceRecord.count({ where: { person_type: "STUDENT", date: { gte: todayStart, lt: todayEnd }, status: "ABSENT" } }),
      prisma.staff.count({ where: { deleted_at: null } }),
      prisma.staff.count({ where: { deleted_at: null, is_active: true } }),
      prisma.leaveRequest.count({ where: { status: "APPROVED", from_date: { lte: todayEnd }, to_date: { gte: todayStart } } }),
      prisma.attendanceRecord.count({ where: { person_type: "STAFF", date: { gte: todayStart, lt: todayEnd }, status: "PRESENT" } }),
      prisma.payment.findMany({ where: { status: "COMPLETED", paid_at: { gte: todayStart, lt: todayEnd } }, select: { amount: true } }),
      prisma.payment.findMany({ where: { status: "COMPLETED", paid_at: { gte: monthStart, lt: monthEnd } }, select: { amount: true } }),
      prisma.invoice.findMany({ where: { status: { notIn: ["PAID", "WAIVED"] } }, select: { amount_due: true, amount_paid: true, fine_amount: true } }),
      prisma.invoice.count({ where: { status: { notIn: ["PAID", "WAIVED"] }, due_date: { lt: now } } }),
      prisma.exam.count({ where: { status: { in: ["ACTIVE", "MARK_ENTRY"] } } }),
      prisma.resultPublication.count({ where: { is_published: true } }),
      prisma.event.count({ where: { date_from: { gte: now } } }),
      prisma.bookIssue.count({ where: { status: "ISSUED" } }),
      prisma.bookIssue.count({ where: { status: "ISSUED", due_date: { lt: now } } }),
      prisma.resultPublication.findFirst({
        where: { is_published: true },
        orderBy: { published_at: "desc" },
        select: { published_at: true, exam: { select: { name: true } } },
      }),
    ]);

    const totalOutstanding = outstandingInvoices.reduce((sum, i) => sum + (i.amount_due + i.fine_amount - i.amount_paid), 0);

    res.json({
      success: true,
      data: {
        students: {
          total: studentsTotal,
          active: studentsActive,
          new_this_year: studentsNewThisYear,
          today_present: studentsPresentToday,
          today_absent: studentsAbsentToday,
          // Against studentsActive (currently-enrolled students), not
          // present+absent — dividing by "however many happen to be marked
          // so far" made this read ~100% all day regardless of real
          // coverage (e.g. 53 present / 0 absent = 100% with 3000+
          // students not yet marked). This version correctly reads low
          // early in the day and climbs toward the true rate as more
          // sections get marked, instead of being misleadingly high from
          // the first attendance row onward.
          today_percentage: studentsActive ? Math.round((studentsPresentToday / studentsActive) * 1000) / 10 : null,
        },
        staff: { total: staffTotal, active: staffActive, on_leave_today: staffOnLeaveToday, present_today: staffPresentToday },
        finance: {
          today_collection: todayPayments.reduce((s, p) => s + p.amount, 0),
          this_month_collection: monthPayments.reduce((s, p) => s + p.amount, 0),
          total_outstanding: Math.round(totalOutstanding * 100) / 100,
          overdue_invoices: overdueInvoicesCount,
        },
        academic: {
          active_exams: activeExams,
          published_results: publishedResults,
          upcoming_events: upcomingEvents,
          latest_published_exam: latestPublishedExam ? { name: latestPublishedExam.exam.name, published_at: latestPublishedExam.published_at } : null,
        },
        library: { books_issued: booksIssued, overdue_issues: overdueIssues },
      },
    });
  }),
);

analyticsRouter.get(
  "/attendance-trend",
  asyncHandler(async (req, res) => {
    const query = z.object({ period: z.enum(["WEEKLY", "MONTHLY"]).default("WEEKLY"), class_id: z.string().optional(), weeks_back: z.coerce.number().int().min(1).max(52).default(8) }).parse(req.query);

    const now = new Date();
    const labels: string[] = [];
    const presentPercentage: number[] = [];

    const unitDays = query.period === "WEEKLY" ? 7 : 30;
    for (let i = query.weeks_back - 1; i >= 0; i--) {
      const end = new Date(now.getTime() - i * unitDays * 24 * 60 * 60 * 1000);
      const start = new Date(end.getTime() - unitDays * 24 * 60 * 60 * 1000);

      const where = {
        person_type: "STUDENT" as const,
        date: { gte: start, lt: end },
        ...(query.class_id && { student: { current_class_id: query.class_id } }),
      };
      const [present, total] = await Promise.all([
        prisma.attendanceRecord.count({ where: { ...where, status: "PRESENT" } }),
        prisma.attendanceRecord.count({ where }),
      ]);

      labels.push(query.period === "WEEKLY" ? `Week ${query.weeks_back - i}` : `Month ${query.weeks_back - i}`);
      presentPercentage.push(total ? Math.round((present / total) * 1000) / 10 : 0);
    }

    res.json({ success: true, data: { labels, present_percentage: presentPercentage } });
  }),
);

analyticsRouter.get(
  "/result-performance",
  asyncHandler(async (req, res) => {
    const query = z.object({ academic_year_id: z.string().min(1), class_id: z.string().optional() }).parse(req.query);

    const exams = await prisma.exam.findMany({ where: { academic_year_id: query.academic_year_id, status: "PUBLISHED" } });
    const classes = query.class_id
      ? await prisma.class.findMany({ where: { id: query.class_id } })
      : await prisma.class.findMany({ where: { academic_year_id: query.academic_year_id } });

    const perExamByClass: { exam_name: string; class_name: string; avg_gpa: number }[] = [];
    for (const exam of exams) {
      for (const klass of classes) {
        const results = await computeClassResults(exam.id, klass.id).catch(() => []);
        if (!results.length) continue;
        const avgGpa = results.reduce((s, r) => s + r.result.total_gpa, 0) / results.length;
        perExamByClass.push({ exam_name: exam.name, class_name: klass.name_en, avg_gpa: Math.round(avgGpa * 100) / 100 });
      }
    }

    const subjectPerformance: { subject_name: string; average_marks: number }[] = [];
    if (exams.length) {
      const latestExam = exams[exams.length - 1]!;
      const subjectIds = query.class_id ? (await prisma.subject.findMany({ where: { class_id: query.class_id } })).map((s) => s.id) : [];
      const entries = await prisma.markEntry.findMany({
        where: { exam_id: latestExam.id, ...(subjectIds.length && { subject_id: { in: subjectIds } }) },
        include: { subject: true },
      });
      const bySubject = new Map<string, { name: string; total: number; count: number }>();
      for (const e of entries) {
        if (e.is_absent || e.marks_total === null) continue;
        const existing = bySubject.get(e.subject_id) ?? { name: e.subject.name_en, total: 0, count: 0 };
        existing.total += e.marks_total;
        existing.count += 1;
        bySubject.set(e.subject_id, existing);
      }
      for (const s of bySubject.values()) subjectPerformance.push({ subject_name: s.name, average_marks: Math.round((s.total / s.count) * 10) / 10 });
    }

    res.json({ success: true, data: { per_exam_by_class: perExamByClass, subject_performance: subjectPerformance } });
  }),
);

analyticsRouter.get(
  "/fee-collection",
  asyncHandler(async (req, res) => {
    const query = z.object({ from_date: z.string().min(1), to_date: z.string().min(1) }).parse(req.query);
    const from = new Date(query.from_date);
    const to = new Date(new Date(query.to_date).getTime() + 24 * 60 * 60 * 1000);

    const payments = await prisma.payment.findMany({
      where: { status: "COMPLETED", paid_at: { gte: from, lt: to } },
      include: { invoice: { select: { category: true } } },
    });

    const dailyMap = new Map<string, number>();
    const categoryMap = new Map<string, number>();
    const gatewayMap = new Map<string, number>();

    for (const p of payments) {
      const dateKey = (p.paid_at ?? p.created_at).toISOString().slice(0, 10);
      dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + p.amount);
      categoryMap.set(p.invoice.category, (categoryMap.get(p.invoice.category) ?? 0) + p.amount);
      gatewayMap.set(p.gateway, (gatewayMap.get(p.gateway) ?? 0) + p.amount);
    }

    res.json({
      success: true,
      data: {
        daily: [...dailyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount })),
        by_category: [...categoryMap.entries()].map(([category, total]) => ({ category, total })),
        gateway_breakdown: [...gatewayMap.entries()].map(([gateway, total]) => ({ gateway, total })),
      },
    });
  }),
);

interface RiskResult {
  student_id: string;
  name_en: string;
  student_uid: string;
  father_phone: string | null;
  class_name: string | null;
  section_name: string | null;
  attendance_percentage: number | null;
  days_overdue: number;
  total_due: number;
  risk_score: number;
}

// Shared by the list route and the message-draft route (Phase 64) so a
// guardian's draft message always reflects the exact same numbers the
// admin saw in the list, computed once, not two slightly-different ways.
// Attendance percentage is now real subject-wise data (Plan Twelve), passed
// in already-computed via the shared, batched computeSubjectWiseAttendance
// util — this function no longer queries attendance itself, so callers
// must batch that lookup once for the whole roster, not per student.
async function computeStudentRisk(
  s: { id: string; name_en: string; student_uid: string; father_phone: string | null; current_class: { name_en: string } | null; current_section: { name: string } | null },
  minAttendance: number,
  attendancePct: number | null,
): Promise<RiskResult | null> {
  const now = new Date();

  const overdueInvoices = await prisma.invoice.findMany({ where: { student_id: s.id, status: { notIn: ["PAID", "WAIVED"] }, due_date: { lt: now } } });
  const maxDaysOverdue = overdueInvoices.reduce((max, inv) => Math.max(max, Math.floor((now.getTime() - inv.due_date.getTime()) / (1000 * 60 * 60 * 24))), 0);
  const totalDue = overdueInvoices.reduce((sum, inv) => sum + (inv.amount_due + inv.fine_amount - inv.amount_paid), 0);

  const lowAttendance = attendancePct !== null && attendancePct < minAttendance;
  const longOverdue = maxDaysOverdue > 30;
  if (!lowAttendance && !longOverdue) return null;

  const attendanceRisk = attendancePct !== null ? Math.max(0, minAttendance - attendancePct) : 0;
  const dueRisk = Math.min(50, maxDaysOverdue / 2);
  const riskScore = Math.round(attendanceRisk + dueRisk);

  return {
    student_id: s.id,
    name_en: s.name_en,
    student_uid: s.student_uid,
    father_phone: s.father_phone,
    class_name: s.current_class?.name_en ?? null,
    section_name: s.current_section?.name ?? null,
    attendance_percentage: attendancePct !== null ? Math.round(attendancePct * 10) / 10 : null,
    days_overdue: maxDaysOverdue,
    total_due: Math.round(totalDue * 100) / 100,
    risk_score: riskScore,
  };
}

analyticsRouter.get(
  "/defaulters-risk",
  authorize(ANALYTICS_MESSAGE_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ class_id: z.string().optional(), section_id: z.string().optional(), group_id: z.string().optional() }).parse(req.query);
    const students = await prisma.student.findMany({
      where: {
        deleted_at: null,
        status: "ACTIVE",
        ...(query.class_id && { current_class_id: query.class_id }),
        ...(query.section_id && { current_section_id: query.section_id }),
        ...(query.group_id && { group_id: query.group_id }),
      },
      include: { current_class: true, current_section: true },
    });
    const rules = await prisma.attendanceRules.findUnique({ where: { id: "singleton" } });
    const minAttendance = rules?.min_attendance_percentage ?? 75;

    // One batched query for the whole roster, not one per student — see
    // computeSubjectWiseAttendance's own comment on why this matters now
    // that attendance data is ~7x the row volume it used to be.
    const attendanceByStudent = await computeSubjectWiseAttendance(prisma, students.map((s) => s.id));

    const results: RiskResult[] = [];
    for (const s of students) {
      const summary = attendanceByStudent.get(s.id)!;
      const attendancePct = summary.overall.total > 0 ? summary.overall.percentage : null;
      const risk = await computeStudentRisk(s, minAttendance, attendancePct);
      if (risk) results.push(risk);
    }

    results.sort((a, b) => b.risk_score - a.risk_score);
    res.json({ success: true, data: results });
  }),
);

analyticsRouter.get(
  "/defaulters-risk/:student_id/message-draft",
  authorize(ANALYTICS_MESSAGE_ROLES),
  asyncHandler(async (req, res) => {
    const studentId = reqParam(req, "student_id");
    const student = await prisma.student.findFirst({
      where: { id: studentId, deleted_at: null },
      include: { current_class: true, current_section: true },
    });
    if (!student) throw notFound("Student not found");

    const rules = await prisma.attendanceRules.findUnique({ where: { id: "singleton" } });
    const minAttendance = rules?.min_attendance_percentage ?? 75;
    const summary = (await computeSubjectWiseAttendance(prisma, [studentId])).get(studentId)!;
    const attendancePct = summary.overall.total > 0 ? summary.overall.percentage : null;
    const risk = await computeStudentRisk(student, minAttendance, attendancePct);
    if (!risk) throw badRequest("This student is not currently flagged as at-risk");

    const reasons: string[] = [];
    if (risk.attendance_percentage !== null && risk.attendance_percentage < minAttendance) {
      reasons.push(`attendance is ${risk.attendance_percentage}%`);
    }
    if (risk.days_overdue > 30) {
      reasons.push(`fees are ${risk.days_overdue} days overdue (৳${risk.total_due} due)`);
    }

    const message = `Dear Guardian, we'd like to inform you that ${student.name_en}'s ${reasons.join(" and ")}. Please contact the school office at your earliest convenience.`;
    res.json({ success: true, data: { message, father_phone: student.father_phone } });
  }),
);

analyticsRouter.post(
  "/defaulters-risk/:student_id/send-message",
  authorize(ANALYTICS_MESSAGE_ROLES),
  asyncHandler(async (req, res) => {
    const studentId = reqParam(req, "student_id");
    const body = z.object({ message: z.string().min(1).max(640) }).parse(req.body);
    const student = await prisma.student.findFirst({ where: { id: studentId, deleted_at: null }, select: { father_phone: true } });
    if (!student) throw notFound("Student not found");
    if (!student.father_phone) throw notFound("This student has no guardian phone on file");

    // Plain sendSms — not the templated sendNotification() path — since
    // this is an ad-hoc, admin-edited message, not one of the fixed
    // NotificationTrigger templates.
    await sendSms(student.father_phone, body.message);
    res.json({ success: true, data: { sent: true } });
  }),
);

analyticsRouter.get(
  "/class-comparison",
  asyncHandler(async (req, res) => {
    const query = z.object({ academic_year_id: z.string().min(1), exam_id: z.string().optional() }).parse(req.query);
    const classes = await prisma.class.findMany({ where: { academic_year_id: query.academic_year_id } });

    const comparison = await Promise.all(
      classes.map(async (klass) => {
        const students = await prisma.student.findMany({ where: { current_class_id: klass.id, deleted_at: null } });
        const studentIds = students.map((s) => s.id);

        const [present, total] = await Promise.all([
          prisma.attendanceRecord.count({ where: { person_type: "STUDENT", person_id: { in: studentIds }, status: "PRESENT" } }),
          prisma.attendanceRecord.count({ where: { person_type: "STUDENT", person_id: { in: studentIds } } }),
        ]);

        let avgGpa: number | null = null;
        if (query.exam_id) {
          const results = await computeClassResults(query.exam_id, klass.id).catch(() => []);
          if (results.length) avgGpa = Math.round((results.reduce((s, r) => s + r.result.total_gpa, 0) / results.length) * 100) / 100;
        }

        const invoices = await prisma.invoice.findMany({ where: { student_id: { in: studentIds } } });
        const totalDue = invoices.reduce((s, i) => s + i.amount_due + i.fine_amount, 0);
        const totalPaid = invoices.reduce((s, i) => s + i.amount_paid, 0);

        return {
          class_id: klass.id,
          class_name: klass.name_en,
          student_count: students.length,
          attendance_percentage: total ? Math.round((present / total) * 1000) / 10 : null,
          avg_gpa: avgGpa,
          fee_collection_percentage: totalDue ? Math.round((totalPaid / totalDue) * 1000) / 10 : null,
        };
      }),
    );

    res.json({ success: true, data: comparison });
  }),
);

analyticsRouter.get(
  "/teacher-workload",
  asyncHandler(async (_req, res) => {
    const teachers = await prisma.staff.findMany({
      where: { is_active: true, deleted_at: null, subject_assignments: { some: {} } },
      include: { subject_assignments: { include: { subject: true } } },
    });

    const workload = await Promise.all(
      teachers.map(async (t) => {
        const classIds = [...new Set(t.subject_assignments.map((a) => a.subject.class_id))];
        const subjectIds = t.subject_assignments.map((a) => a.subject_id);
        const studentCount = await prisma.student.count({ where: { current_class_id: { in: classIds }, deleted_at: null } });
        const pendingMarkEntries = await prisma.exam.count({ where: { status: "MARK_ENTRY", subject_configs: { some: { subject_id: { in: subjectIds } } } } });

        return {
          staff_id: t.id,
          name_en: t.name_en,
          classes_assigned: classIds.length,
          subjects_assigned: subjectIds.length,
          student_count: studentCount,
          pending_mark_entry_exams: pendingMarkEntries,
        };
      }),
    );

    res.json({ success: true, data: workload });
  }),
);

analyticsRouter.get(
  "/enrollment-trend",
  asyncHandler(async (_req, res) => {
    const years = await prisma.academicYear.findMany({ orderBy: { start_date: "asc" } });
    const trend = await Promise.all(
      years.map(async (y) => ({
        year: y.label,
        enrollment: await prisma.student.count({ where: { deleted_at: null, created_at: { gte: y.start_date, lte: y.end_date } } }),
      })),
    );
    res.json({ success: true, data: trend });
  }),
);

analyticsRouter.get(
  "/library-utilization",
  asyncHandler(async (_req, res) => {
    const [totalBooks, totalCopies, issuedNow, totalIssuesEver, overdueNow] = await Promise.all([
      prisma.book.count({ where: { is_active: true } }),
      prisma.book.aggregate({ _sum: { total_copies: true } }),
      prisma.bookIssue.count({ where: { status: "ISSUED" } }),
      prisma.bookIssue.count(),
      prisma.bookIssue.count({ where: { status: "ISSUED", due_date: { lt: new Date() } } }),
    ]);
    const copies = totalCopies._sum.total_copies ?? 0;
    res.json({
      success: true,
      data: {
        total_titles: totalBooks,
        total_copies: copies,
        currently_issued: issuedNow,
        utilization_rate: copies ? Math.round((issuedNow / copies) * 1000) / 10 : 0,
        total_issues_all_time: totalIssuesEver,
        overdue_now: overdueNow,
      },
    });
  }),
);

analyticsRouter.get(
  "/staff-attendance",
  asyncHandler(async (req, res) => {
    const query = z.object({ from_date: z.string().min(1), to_date: z.string().min(1) }).parse(req.query);
    const from = new Date(query.from_date);
    const to = new Date(new Date(query.to_date).getTime() + 24 * 60 * 60 * 1000);

    const staff = await prisma.staff.findMany({ where: { is_active: true, deleted_at: null }, include: { department: { select: { name_en: true } } } });
    const report = await Promise.all(
      staff.map(async (s) => {
        const [present, absent, late, leave] = await Promise.all([
          prisma.attendanceRecord.count({ where: { person_id: s.id, person_type: "STAFF", date: { gte: from, lt: to }, status: "PRESENT" } }),
          prisma.attendanceRecord.count({ where: { person_id: s.id, person_type: "STAFF", date: { gte: from, lt: to }, status: "ABSENT" } }),
          prisma.attendanceRecord.count({ where: { person_id: s.id, person_type: "STAFF", date: { gte: from, lt: to }, status: "LATE" } }),
          prisma.attendanceRecord.count({ where: { person_id: s.id, person_type: "STAFF", date: { gte: from, lt: to }, status: "LEAVE" } }),
        ]);
        return { staff_id: s.id, name_en: s.name_en, department: s.department?.name_en ?? null, present, absent, late, leave };
      }),
    );
    res.json({ success: true, data: report });
  }),
);

analyticsRouter.get(
  "/leave-summary",
  asyncHandler(async (req, res) => {
    const query = z.object({ from_date: z.string().optional(), to_date: z.string().optional() }).parse(req.query);
    const leaves = await prisma.leaveRequest.findMany({
      where: {
        ...(query.from_date && { from_date: { gte: new Date(query.from_date) } }),
        ...(query.to_date && { to_date: { lte: new Date(query.to_date) } }),
      },
      include: { staff: { select: { name_en: true, staff_uid: true } }, leave_type: true },
      orderBy: { from_date: "desc" },
    });
    res.json({ success: true, data: leaves });
  }),
);

analyticsRouter.post(
  "/defaulters-risk/:student_id/remind",
  authorize(ANALYTICS_MESSAGE_ROLES),
  asyncHandler(async (req, res) => {
    const studentId = reqParam(req, "student_id");
    const student = await prisma.student.findFirst({
      where: { id: studentId, deleted_at: null },
      select: { id: true, name_en: true, father_phone: true, guardian: { select: { user_id: true, email: true } } },
    });
    if (!student) throw notFound("Student not found");
    if (!student.father_phone) throw notFound("This student has no guardian phone on file");

    const [dueInvoices, institution] = await Promise.all([
      prisma.invoice.findMany({ where: { student_id: studentId, status: { in: ["PENDING", "OVERDUE", "PARTIAL"] } } }),
      prisma.institutionProfile.findFirst(),
    ]);
    const totalDue = dueInvoices.reduce((sum, inv) => sum + (inv.amount_due + inv.fine_amount - inv.amount_paid), 0);
    const now = new Date();

    const result = await sendNotification({
      trigger: "FEE_DUE",
      recipients: [{ name: student.name_en, phone: student.father_phone, email: student.guardian?.email, user_id: student.guardian?.user_id, person_id: student.id }],
      template_data: {
        student_name: student.name_en,
        amount: totalDue.toFixed(2),
        month: MONTH_NAMES[now.getMonth()] ?? "",
        school_name: institution?.name_en ?? "the institution",
      },
    });
    // Previously SMS/email-only — a guardian never saw "Fee Due" in their
    // portal bell even though the same dual-fire pattern already exists for
    // Notices/Documents/Leave. Fired alongside, not instead of, the SMS above.
    if (student.guardian?.user_id) {
      await createInAppNotification({
        userId: student.guardian.user_id,
        type: "FEE_DUE",
        title: `Fee due for ${student.name_en}`,
        body: `৳${totalDue.toFixed(2)} outstanding`,
        link: "/fees",
      });
    }
    res.json({ success: true, data: result });
  }),
);
