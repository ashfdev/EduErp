import { prisma } from "../../lib/prisma";
import { calculateGrade, type GradeRangeLike } from "../../utils/grading.engine";
import { computeSubjectWiseAttendance } from "../../utils/subject-attendance";
import { badRequest, notFound } from "../../lib/errors";

// Term-Based weighted result engine (Plan Fifteen, Phase I) — wires up the
// previously dead ExamTypeConfig.weight_in_annual field for real. Deliberately
// read-only/on-demand: never writes back into or mutates any real Exam/
// MarkEntry/ResultPublication row, and only ever blends exams that are
// already individually published — this is a presentation-layer combination
// of already-official results, not a new grading authority.
//
// Per the owner's confirmed Mode A ("Term-Based") design: Attendance % and
// Extracurricular remarks are surfaced as informational-only context and
// never enter the blended percentage/grade/GPA computation below.

export interface CombinedContribution {
  exam_id: string;
  exam_name: string;
  exam_type_name: string;
  weight: number;
  marks_total: number | null;
  full_marks: number;
  percentage: number | null;
}

export interface CombinedSubjectRow {
  subject_id: string;
  subject_name: string;
  contributions: CombinedContribution[];
  blended_percentage: number | null;
  blended_grade_letter: string | null;
  blended_grade_point: number | null;
}

export interface ContributingExam {
  id: string;
  name: string;
  exam_type_name: string;
  weight: number;
  published: boolean;
}

export interface CombinedResult {
  student: { id: string; name_en: string; student_uid: string; current_roll_no: string | null };
  academic_year_label: string;
  contributing_exams: ContributingExam[];
  subjects: CombinedSubjectRow[];
  overall_percentage: number | null;
  overall_gpa: number | null;
  overall_grade_letter: string | null;
  has_failed: boolean;
  attendance: { total_days: number; present: number; absent: number; percentage: number } | null;
  extracurricular_remarks: string | null;
}

export async function computeCombinedResult(studentId: string, academicYearId: string): Promise<CombinedResult> {
  const [student, academicYear] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId } }),
    prisma.academicYear.findUnique({ where: { id: academicYearId } }),
  ]);
  if (!student) throw notFound("Student not found");
  if (!academicYear) throw notFound("Academic year not found");
  if (!student.current_class_id) throw badRequest("This student has no current class assigned");

  const studentSummary = { id: student.id, name_en: student.name_en, student_uid: student.student_uid, current_roll_no: student.current_roll_no };

  // Every exam type with a nonzero weight participates — an institution that
  // never sets weight_in_annual on anything gets an empty, clearly-labeled
  // result rather than a confusing partial blend.
  const examTypes = await prisma.examTypeConfig.findMany({ where: { weight_in_annual: { gt: 0 }, is_active: true } });
  const extracurricular = await prisma.extracurricularRemark.findFirst({ where: { student_id: studentId, academic_year_id: academicYearId } });

  if (!examTypes.length) {
    return {
      student: studentSummary, academic_year_label: academicYear.label, contributing_exams: [], subjects: [],
      overall_percentage: null, overall_gpa: null, overall_grade_letter: null, has_failed: false,
      attendance: null, extracurricular_remarks: extracurricular?.remarks ?? null,
    };
  }

  const examTypeWeight = new Map(examTypes.map((e) => [e.id, e.weight_in_annual]));
  const exams = await prisma.exam.findMany({
    where: { academic_year_id: academicYearId, exam_type_config_id: { in: examTypes.map((e) => e.id) } },
    include: { exam_type_config: true, grading_scale: { include: { ranges: { orderBy: { display_order: "asc" } } } } },
  });

  const contributingExams: ContributingExam[] = [];
  const subjectMap = new Map<string, CombinedSubjectRow>();
  let gradingScale: GradeRangeLike[] = [];

  for (const exam of exams) {
    // Only a genuinely PUBLISHED result for this student's own class+group
    // ever contributes — an exam still in progress (or published for a
    // different group in a grouped class) is reported as "not yet
    // published" rather than silently skipped or, worse, silently blended
    // with unapproved marks.
    const pub = await prisma.resultPublication.findFirst({
      where: { exam_id: exam.id, class_id: student.current_class_id!, group_id: student.group_id ?? null, is_published: true },
    });
    const weight = examTypeWeight.get(exam.exam_type_config_id) ?? 0;
    contributingExams.push({ id: exam.id, name: exam.name, exam_type_name: exam.exam_type_config?.name ?? "", weight, published: !!pub });
    if (!pub) continue;

    if (!gradingScale.length && exam.grading_scale?.ranges.length) gradingScale = exam.grading_scale.ranges;

    const entries = await prisma.markEntry.findMany({ where: { exam_id: exam.id, student_id: studentId }, include: { subject: true } });
    for (const entry of entries) {
      const row = subjectMap.get(entry.subject_id) ?? {
        subject_id: entry.subject_id, subject_name: entry.subject.name_en, contributions: [],
        blended_percentage: null, blended_grade_letter: null, blended_grade_point: null,
      };
      const fullMarks = entry.subject.full_marks || 100;
      const percentage = entry.is_absent || entry.marks_total === null ? null : Math.round(((entry.marks_total / fullMarks) * 100) * 100) / 100;
      row.contributions.push({
        exam_id: exam.id, exam_name: exam.name, exam_type_name: exam.exam_type_config?.name ?? "", weight,
        marks_total: entry.is_absent ? null : entry.marks_total, full_marks: fullMarks, percentage,
      });
      subjectMap.set(entry.subject_id, row);
    }
  }

  const subjects = [...subjectMap.values()].map((row) => {
    const valid = row.contributions.filter((c) => c.percentage !== null);
    const totalWeight = valid.reduce((s, c) => s + c.weight, 0);
    if (!valid.length || totalWeight <= 0) return row;
    const blended = valid.reduce((s, c) => s + c.weight * (c.percentage ?? 0), 0) / totalWeight;
    row.blended_percentage = Math.round(blended * 100) / 100;
    if (gradingScale.length) {
      const g = calculateGrade(row.blended_percentage, false, gradingScale);
      row.blended_grade_letter = g.grade_letter;
      row.blended_grade_point = g.grade_point;
    }
    return row;
  });

  const graded = subjects.filter((s) => s.blended_percentage !== null);
  const overallPercentage = graded.length ? Math.round((graded.reduce((s, r) => s + (r.blended_percentage ?? 0), 0) / graded.length) * 100) / 100 : null;
  const overallGpa = graded.length ? Math.round((graded.reduce((s, r) => s + (r.blended_grade_point ?? 0), 0) / graded.length) * 100) / 100 : null;
  const hasFailed = graded.some((r) => r.blended_grade_letter === "F");
  const overallGradeLetter = hasFailed
    ? "F"
    : overallPercentage !== null && gradingScale.length
      ? calculateGrade(overallPercentage, false, gradingScale).grade_letter
      : null;

  const attendanceSummary = (await computeSubjectWiseAttendance(prisma, [studentId], { gte: academicYear.start_date, lte: academicYear.end_date })).get(studentId);
  const attendance = attendanceSummary
    ? {
        total_days: attendanceSummary.overall.total,
        present: attendanceSummary.overall.present,
        absent: attendanceSummary.overall.total - attendanceSummary.overall.present,
        percentage: attendanceSummary.overall.total ? attendanceSummary.overall.percentage : 0,
      }
    : null;

  return {
    student: studentSummary,
    academic_year_label: academicYear.label,
    contributing_exams: contributingExams,
    subjects,
    overall_percentage: overallPercentage,
    overall_gpa: overallGpa,
    overall_grade_letter: overallGradeLetter,
    has_failed: hasFailed,
    attendance,
    extracurricular_remarks: extracurricular?.remarks ?? null,
  };
}
