import type { AttendanceStatus } from "@education-erp/db";
import { prisma } from "../../lib/prisma";
import { dateOnlyFrom, dateOnlyFromParts } from "../../lib/date-only";
import { computeSubjectWiseAttendance } from "../../utils/subject-attendance";
import { notFound } from "../../lib/errors";
import {
  formatDateOnly,
  formatTime,
  percent,
  renderReport,
  reportAuthor,
  reportFileName,
  type ReportColumn,
  type ReportFormat,
  type ReportSection,
  type ReportTone,
} from "../../lib/report";

const STATUS_CODE: Record<AttendanceStatus, string> = { PRESENT: "P", ABSENT: "A", LATE: "L", LEAVE: "LV", HALF_DAY: "H" };
const STATUS_LABEL: Record<AttendanceStatus | "UNMARKED", string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  LEAVE: "Leave",
  HALF_DAY: "Half day",
  UNMARKED: "Not marked",
};
// Present stays unhighlighted so absences stand out in a dense grid.
const STATUS_TONE: Record<AttendanceStatus | "UNMARKED", ReportTone | undefined> = {
  PRESENT: undefined,
  ABSENT: "bad",
  LATE: "warn",
  LEAVE: "muted",
  HALF_DAY: "warn",
  UNMARKED: "muted",
};
const WEEKDAY = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4, 6];

// Same rule as promotion and exam documents (computeDailyAttendancePercentage): only PRESENT counts.
export const ATTENDANCE_RULE_NOTE =
  "Attendance % = Present ÷ days marked. Late, Leave and Half day count as not present — the same rule used for promotion.";

async function attendanceRules() {
  const rules = await prisma.attendanceRules.findUnique({ where: { id: "singleton" } });
  return {
    threshold: rules?.min_attendance_percentage ?? 75,
    workingDays: new Set((rules?.working_days as number[] | null) ?? DEFAULT_WORKING_DAYS),
  };
}

function byRoll(a: { current_roll_no: string | null; name_en: string }, b: { current_roll_no: string | null; name_en: string }) {
  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  return collator.compare(a.current_roll_no ?? "~", b.current_roll_no ?? "~") || collator.compare(a.name_en, b.name_en);
}

function countStatuses(statuses: AttendanceStatus[]) {
  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0, HALF_DAY: 0 };
  for (const s of statuses) counts[s]++;
  return { ...counts, marked: statuses.length, percentage: percent(counts.PRESENT, statuses.length) };
}

// ── Daily register ───────────────────────────────────────────────

export async function loadDailyRegister(params: { date: Date; class_id: string; section_id: string }) {
  const date = dateOnlyFrom(params.date);
  const [klass, section, students, records] = await Promise.all([
    prisma.class.findUnique({ where: { id: params.class_id }, select: { name_en: true } }),
    prisma.section.findUnique({ where: { id: params.section_id }, include: { shift: true, class_teacher: true } }),
    prisma.student.findMany({
      where: { current_section_id: params.section_id, deleted_at: null, status: "ACTIVE" },
      select: { id: true, student_uid: true, current_roll_no: true, name_en: true, name_bn: true },
    }),
    prisma.attendanceRecord.findMany({ where: { section_id: params.section_id, date } }),
  ]);
  const byStudent = new Map(records.map((r) => [r.student_id, r]));
  return {
    class: klass?.name_en,
    section: section?.name,
    shift: section?.shift?.name,
    teacher: section?.class_teacher?.name_en,
    date,
    rows: students.sort(byRoll).map((s) => {
      const record = byStudent.get(s.id);
      return {
        roll_no: s.current_roll_no,
        student_uid: s.student_uid,
        name_en: s.name_en,
        name_bn: s.name_bn,
        status: (record?.status ?? "UNMARKED") as AttendanceStatus | "UNMARKED",
        check_in_at: record?.check_in_at ?? null,
      };
    }),
  };
}

export async function buildDailyRegisterReport(params: { date: Date; class_id: string; section_id: string; format: ReportFormat; generated_by_id?: string }) {
  const [data, generatedBy] = await Promise.all([loadDailyRegister(params), reportAuthor(params.generated_by_id)]);
  type Row = (typeof data.rows)[number];
  const statuses = data.rows.map((r) => r.status).filter((s): s is AttendanceStatus => s !== "UNMARKED");
  const counts = countStatuses(statuses);
  const unmarked = data.rows.length - statuses.length;
  const columns: ReportColumn<Row>[] = [
    { header: "#", value: (_, i) => i + 1, type: "number", width: 5 },
    { header: "Roll", value: (r) => r.roll_no, type: "code", width: 7 },
    { header: "Student ID", value: (r) => r.student_uid, type: "code", width: 16 },
    { header: "Name", value: (r) => r.name_en, width: 26 },
    ...(data.rows.some((r) => r.name_bn) ? [{ header: "Name (Bangla)", value: (r: Row) => r.name_bn, width: 22 }] : []),
    { header: "Status", value: (r) => STATUS_LABEL[r.status], type: "code", width: 12, tone: (r) => STATUS_TONE[r.status] },
    ...(data.rows.some((r) => r.check_in_at) ? [{ header: "Check-in", value: (r: Row) => formatTime(r.check_in_at), type: "code" as const, width: 11 }] : []),
  ];
  return renderReport(
    {
      title: "Daily Attendance Register",
      fileName: reportFileName("Attendance Register", data.class, data.section && `Section ${data.section}`, formatDateOnly(data.date).replace(/\//g, "-")),
      filters: [
        { label: "Date", value: formatDateOnly(data.date) },
        { label: "Class", value: data.class ?? "—" },
        { label: "Section", value: data.section ?? "—" },
        ...(data.shift ? [{ label: "Shift", value: data.shift }] : []),
        ...(data.teacher ? [{ label: "Class teacher", value: data.teacher }] : []),
      ],
      generatedBy,
      legend: [ATTENDANCE_RULE_NOTE],
      sections: [
        {
          title: `${data.class ?? ""} · Section ${data.section ?? ""}`,
          subtitle: formatDateOnly(data.date),
          columns,
          rows: data.rows,
          stats: [
            { label: "Students", value: data.rows.length },
            { label: "Present", value: counts.PRESENT, tone: "good" },
            { label: "Absent", value: counts.ABSENT, tone: counts.ABSENT ? "bad" : undefined },
            { label: "Late", value: counts.LATE, tone: counts.LATE ? "warn" : undefined },
            { label: "Leave", value: counts.LEAVE },
            { label: "Not marked", value: unmarked, tone: unmarked ? "warn" : undefined },
            { label: "Attendance", value: counts.percentage === null ? "—" : `${counts.percentage}%` },
          ],
        },
      ],
    },
    params.format,
  );
}

// ── Monthly sheet ────────────────────────────────────────────────

export async function loadMonthlySheet(params: { class_id: string; section_id: string; month: number; year: number }) {
  const start = dateOnlyFromParts(params.year, params.month - 1, 1);
  const end = dateOnlyFromParts(params.year, params.month, 1);
  const daysInMonth = new Date(Date.UTC(params.year, params.month, 0)).getUTCDate();
  const [klass, section, students, records, rules] = await Promise.all([
    prisma.class.findUnique({ where: { id: params.class_id }, select: { name_en: true } }),
    prisma.section.findUnique({ where: { id: params.section_id }, include: { class_teacher: true } }),
    prisma.student.findMany({
      where: { current_section_id: params.section_id, deleted_at: null, status: "ACTIVE" },
      select: { id: true, student_uid: true, current_roll_no: true, name_en: true },
    }),
    prisma.attendanceRecord.findMany({ where: { section_id: params.section_id, date: { gte: start, lt: end } }, select: { student_id: true, date: true, status: true } }),
    attendanceRules(),
  ]);
  const daysByStudent = new Map<string, Record<number, AttendanceStatus>>();
  for (const r of records) {
    if (!r.student_id) continue;
    const days = daysByStudent.get(r.student_id) ?? {};
    days[r.date.getUTCDate()] = r.status;
    daysByStudent.set(r.student_id, days);
  }
  return {
    class: klass?.name_en,
    section: section?.name,
    teacher: section?.class_teacher?.name_en,
    threshold: rules.threshold,
    days_in_month: daysInMonth,
    days_held: new Set(records.map((r) => r.date.getUTCDate())).size,
    students: students.sort(byRoll).map((s) => ({
      roll_no: s.current_roll_no,
      student_uid: s.student_uid,
      name_en: s.name_en,
      days: daysByStudent.get(s.id) ?? {},
    })),
  };
}

export async function buildMonthlySheetReport(params: { class_id: string; section_id: string; month: number; year: number; format: ReportFormat; generated_by_id?: string }) {
  const [data, rules, generatedBy] = await Promise.all([loadMonthlySheet(params), attendanceRules(), reportAuthor(params.generated_by_id)]);
  const rows = data.students.map((s) => ({ ...s, counts: countStatuses(Object.values(s.days)) }));
  type Row = (typeof rows)[number];
  const today = new Date();
  const dayColumns: ReportColumn<Row>[] = Array.from({ length: data.days_in_month }, (_, i) => {
    const day = i + 1;
    const weekday = new Date(Date.UTC(params.year, params.month - 1, day)).getUTCDay();
    const isWorkingDay = rules.workingDays.has(weekday);
    const isFuture = Date.UTC(params.year, params.month - 1, day) > Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return {
      header: `${day}\n${WEEKDAY[weekday]}`,
      value: (r: Row) => {
        const status = r.days[day];
        if (status) return STATUS_CODE[status];
        return !isWorkingDay && !isFuture ? "–" : "";
      },
      type: "code" as const,
      width: 3.6,
      tone: (r: Row) => {
        const status = r.days[day];
        return status ? STATUS_TONE[status] : isWorkingDay ? undefined : "muted";
      },
      total: (all: Row[]) => all.filter((r) => r.days[day] === "PRESENT").length || "",
    };
  });
  const lowTone = (r: Row): ReportTone | undefined => (r.counts.percentage !== null && r.counts.percentage < rules.threshold ? "bad" : undefined);
  const columns: ReportColumn<Row>[] = [
    { header: "Roll", value: (r) => r.roll_no, type: "code", width: 6 },
    { header: "Name", value: (r) => r.name_en, width: 22 },
    ...dayColumns,
    { header: "P", value: (r) => r.counts.PRESENT, type: "number", width: 4.5, total: (all) => all.reduce((n, r) => n + r.counts.PRESENT, 0) },
    { header: "A", value: (r) => r.counts.ABSENT, type: "number", width: 4.5, total: (all) => all.reduce((n, r) => n + r.counts.ABSENT, 0) },
    { header: "L", value: (r) => r.counts.LATE, type: "number", width: 4.5, total: (all) => all.reduce((n, r) => n + r.counts.LATE, 0) },
    { header: "LV", value: (r) => r.counts.LEAVE, type: "number", width: 4.5, total: (all) => all.reduce((n, r) => n + r.counts.LEAVE, 0) },
    { header: "%", value: (r) => r.counts.percentage, type: "percent", width: 6.5, tone: lowTone },
  ];
  const withPct = rows.filter((r) => r.counts.percentage !== null);
  const average = withPct.length ? Math.round((withPct.reduce((n, r) => n + (r.counts.percentage ?? 0), 0) / withPct.length) * 10) / 10 : null;
  const below = withPct.filter((r) => (r.counts.percentage ?? 100) < rules.threshold).length;
  const monthLabel = `${MONTHS[params.month - 1]} ${params.year}`;

  return renderReport(
    {
      title: "Monthly Attendance Sheet",
      fileName: reportFileName("Monthly Attendance", data.class, data.section && `Section ${data.section}`, monthLabel),
      filters: [
        { label: "Month", value: monthLabel },
        { label: "Class", value: data.class ?? "—" },
        { label: "Section", value: data.section ?? "—" },
        ...(data.teacher ? [{ label: "Class teacher", value: data.teacher }] : []),
      ],
      orientation: "landscape",
      generatedBy,
      legend: [
        "P = Present, A = Absent, L = Late, LV = Leave, H = Half day, – = weekly holiday. The Total row counts students present each day.",
        ATTENDANCE_RULE_NOTE,
      ],
      sections: [
        {
          title: `${data.class ?? ""} · Section ${data.section ?? ""}`,
          subtitle: monthLabel,
          columns,
          rows,
          stats: [
            { label: "Students", value: rows.length },
            { label: "Days held", value: data.days_held },
            { label: "Average attendance", value: average === null ? "—" : `${average}%`, tone: average !== null && average < rules.threshold ? "bad" : "good" },
            { label: `Below ${rules.threshold}%`, value: below, tone: below ? "bad" : undefined },
          ],
        },
      ],
    },
    params.format,
  );
}

// ── Defaulters (subject-wise attendance) ─────────────────────────

export async function findDefaulters(params: { class_id?: string; section_id?: string; threshold?: number }) {
  const rules = await attendanceRules();
  const threshold = params.threshold ?? rules.threshold;
  const students = await prisma.student.findMany({
    where: {
      deleted_at: null,
      status: "ACTIVE",
      ...(params.class_id && { current_class_id: params.class_id }),
      ...(params.section_id && { current_section_id: params.section_id }),
    },
    select: {
      id: true,
      name_en: true,
      student_uid: true,
      current_roll_no: true,
      father_phone: true,
      guardian: { select: { phone: true } },
      current_class: { select: { name_en: true, numeric_level: true } },
      current_section: { select: { name: true } },
    },
  });
  // Batched subject-wise attendance for the whole roster (Plan Twelve).
  const attendanceByStudent = await computeSubjectWiseAttendance(prisma, students.map((s) => s.id));
  const rows = [];
  for (const s of students) {
    const summary = attendanceByStudent.get(s.id);
    if (!summary?.overall.total || summary.overall.percentage >= threshold) continue;
    rows.push({ ...s, attendance_percentage: summary.overall.percentage, total_days: summary.overall.total, present_days: summary.overall.present });
  }
  rows.sort((a, b) => a.attendance_percentage - b.attendance_percentage);
  return { threshold, rows };
}

export async function buildDefaultersReport(params: { class_id?: string; section_id?: string; threshold?: number; format: ReportFormat; generated_by_id?: string }) {
  const [{ threshold, rows }, klass, section, generatedBy] = await Promise.all([
    findDefaulters(params),
    params.class_id ? prisma.class.findUnique({ where: { id: params.class_id }, select: { name_en: true } }) : null,
    params.section_id ? prisma.section.findUnique({ where: { id: params.section_id }, select: { name: true } }) : null,
    reportAuthor(params.generated_by_id),
  ]);
  type Row = (typeof rows)[number];
  const columns: ReportColumn<Row>[] = [
    { header: "#", value: (_, i) => i + 1, type: "number", width: 5 },
    { header: "Student ID", value: (r) => r.student_uid, type: "code", width: 16 },
    { header: "Name", value: (r) => r.name_en, width: 26 },
    { header: "Class", value: (r) => r.current_class?.name_en, width: 12 },
    { header: "Section", value: (r) => r.current_section?.name, type: "code", width: 9 },
    { header: "Roll", value: (r) => r.current_roll_no, type: "code", width: 7 },
    { header: "Guardian Phone", value: (r) => r.guardian?.phone ?? r.father_phone, type: "code", width: 15 },
    { header: "Present", value: (r) => r.present_days, type: "number", width: 9 },
    { header: "Classes held", value: (r) => r.total_days, type: "number", width: 10 },
    { header: "Attendance", value: (r) => r.attendance_percentage, type: "percent", width: 11, tone: () => "bad" },
  ];
  return renderReport(
    {
      title: "Attendance Defaulters",
      fileName: reportFileName("Attendance Defaulters", klass?.name_en, section && `Section ${section.name}`),
      filters: [
        { label: "Class", value: klass?.name_en ?? "All classes" },
        { label: "Section", value: section?.name ?? "All sections" },
        { label: "Showing", value: `Below ${threshold}%` },
      ],
      generatedBy,
      legend: ["Based on subject-wise (period) attendance, the same figure shown on marksheets. Lowest attendance first."],
      sections: [{ title: "Students below the attendance minimum", columns, rows, stats: [{ label: `Below ${threshold}%`, value: rows.length, tone: rows.length ? "bad" : "good" }] }],
    },
    params.format,
  );
}

// ── Monthly summary, one sheet per class ─────────────────────────

export async function buildMonthlySummaryReport(params: { academic_year_id: string; month: number; year: number; class_id?: string; format: ReportFormat; generated_by_id?: string }) {
  const start = dateOnlyFromParts(params.year, params.month - 1, 1);
  const end = dateOnlyFromParts(params.year, params.month, 1);
  const [classes, year, rules, generatedBy] = await Promise.all([
    prisma.class.findMany({
      where: { academic_year_id: params.academic_year_id, ...(params.class_id && { id: params.class_id }) },
      select: { id: true, name_en: true, sections: { select: { id: true, name: true } } },
      orderBy: { numeric_level: "asc" },
    }),
    prisma.academicYear.findUnique({ where: { id: params.academic_year_id }, select: { label: true } }),
    attendanceRules(),
    reportAuthor(params.generated_by_id),
  ]);
  if (!classes.length) throw notFound("No classes found for this academic year");

  const sectionIds = classes.flatMap((c) => c.sections.map((s) => s.id));
  const [students, grouped] = await Promise.all([
    prisma.student.findMany({
      where: { current_section_id: { in: sectionIds }, deleted_at: null, status: "ACTIVE" },
      select: { id: true, student_uid: true, current_roll_no: true, name_en: true, current_section_id: true },
    }),
    prisma.attendanceRecord.groupBy({
      by: ["student_id", "status"],
      where: { section_id: { in: sectionIds }, date: { gte: start, lt: end } },
      _count: { _all: true },
    }),
  ]);
  const statusesByStudent = new Map<string, AttendanceStatus[]>();
  for (const g of grouped) {
    if (!g.student_id) continue;
    const list = statusesByStudent.get(g.student_id) ?? [];
    for (let i = 0; i < g._count._all; i++) list.push(g.status);
    statusesByStudent.set(g.student_id, list);
  }

  const sectionName = new Map(classes.flatMap((c) => c.sections.map((s) => [s.id, s.name] as const)));
  const monthLabel = `${MONTHS[params.month - 1]} ${params.year}`;
  type Row = { roll_no: string | null; student_uid: string; name_en: string; section: string; counts: ReturnType<typeof countStatuses> };
  const lowTone = (r: Row): ReportTone | undefined => (r.counts.percentage !== null && r.counts.percentage < rules.threshold ? "bad" : undefined);
  const sum = (key: "PRESENT" | "ABSENT" | "LATE" | "LEAVE" | "HALF_DAY" | "marked") => (all: Row[]) => all.reduce((n, r) => n + r.counts[key], 0);
  const columns: ReportColumn<Row>[] = [
    { header: "Section", value: (r) => r.section, type: "code", width: 9 },
    { header: "Roll", value: (r) => r.roll_no, type: "code", width: 7 },
    { header: "Student ID", value: (r) => r.student_uid, type: "code", width: 16 },
    { header: "Name", value: (r) => r.name_en, width: 26 },
    { header: "Present", value: (r) => r.counts.PRESENT, type: "number", width: 9, total: sum("PRESENT") },
    { header: "Absent", value: (r) => r.counts.ABSENT, type: "number", width: 9, total: sum("ABSENT") },
    { header: "Late", value: (r) => r.counts.LATE, type: "number", width: 8, total: sum("LATE") },
    { header: "Leave", value: (r) => r.counts.LEAVE, type: "number", width: 8, total: sum("LEAVE") },
    { header: "Half day", value: (r) => r.counts.HALF_DAY, type: "number", width: 9, total: sum("HALF_DAY") },
    { header: "Days marked", value: (r) => r.counts.marked, type: "number", width: 10 },
    { header: "Attendance", value: (r) => r.counts.percentage, type: "percent", width: 11, tone: lowTone },
  ];

  const allSections: ReportSection<Row>[] = classes.map((c) => {
    const ids = new Set(c.sections.map((s) => s.id));
    const rows: Row[] = students
      .filter((s) => s.current_section_id && ids.has(s.current_section_id))
      .map((s) => ({
        roll_no: s.current_roll_no,
        student_uid: s.student_uid,
        name_en: s.name_en,
        section: sectionName.get(s.current_section_id ?? "") ?? "",
        counts: countStatuses(statusesByStudent.get(s.id) ?? []),
      }))
      .sort((a, b) => new Intl.Collator("en", { numeric: true }).compare(a.section, b.section) || byRoll({ current_roll_no: a.roll_no, name_en: a.name_en }, { current_roll_no: b.roll_no, name_en: b.name_en }));
    const withPct = rows.filter((r) => r.counts.percentage !== null);
    const average = withPct.length ? Math.round((withPct.reduce((n, r) => n + (r.counts.percentage ?? 0), 0) / withPct.length) * 10) / 10 : null;
    const below = withPct.filter((r) => (r.counts.percentage ?? 100) < rules.threshold).length;
    return {
      title: c.name_en,
      subtitle: monthLabel,
      columns,
      rows,
      stats: [
        { label: "Students", value: rows.length },
        { label: "Average attendance", value: average === null ? "—" : `${average}%`, tone: average !== null && average < rules.threshold ? "bad" : "good" },
        { label: `Below ${rules.threshold}%`, value: below, tone: below ? "bad" : undefined },
      ],
    };
  });

  // A whole-year export skips classes with no students instead of printing empty pages.
  const withStudents = allSections.filter((section) => section.rows.length);
  const sections = withStudents.length ? withStudents : allSections.slice(0, 1);

  return renderReport(
    {
      title: "Monthly Attendance Summary",
      fileName: reportFileName("Attendance Summary", params.class_id ? classes[0]?.name_en : "All Classes", monthLabel),
      filters: [
        { label: "Month", value: monthLabel },
        { label: "Academic year", value: year?.label ?? "—" },
        { label: "Class", value: params.class_id ? (classes[0]?.name_en ?? "—") : "All classes" },
      ],
      generatedBy,
      legend: [ATTENDANCE_RULE_NOTE],
      sections,
    },
    params.format,
  );
}
