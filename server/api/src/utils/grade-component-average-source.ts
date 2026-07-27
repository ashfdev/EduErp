import type { Prisma, PrismaClient } from "@education-erp/db";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface AverageOfExamsFetchResult {
  average: number;
  count: number;
}

export interface AverageOfExamsRequest {
  component_id: string;
  subject_id: string;
  source_exam_ids: string[];
}

// Resolves the auto-average fetch for every AVERAGE_OF_EXAMS mark component
// (the CT-average case — an admin picks one or more SPECIFIC exams directly,
// no type/category matching involved) in one batch, not a per-cell query
// loop. Only counts a source exam's marks for a student once its result is
// actually published for that student's class+group — an unpublished
// source exam is silently excluded from the average, never treated as a 0.
// `count` (how many of the selected source exams actually contributed) is
// carried through for the mark-entry grid's explanatory annotation (e.g.
// "Average of 2 selected exam(s): 78.5%"), not just the resolved value.
// Keyed by `${component_id}:${studentId}` — each component carries its own
// explicit source_exam_ids, so no shared "source type" dimension is needed
// anymore.
export async function computeAverageOfExamsFetch(
  tx: Tx,
  requests: AverageOfExamsRequest[],
  classId: string,
  studentIds: string[],
): Promise<Map<string, AverageOfExamsFetchResult>> {
  const result = new Map<string, AverageOfExamsFetchResult>();
  if (!requests.length || !studentIds.length) return result;

  const allSourceExamIds = [...new Set(requests.flatMap((r) => r.source_exam_ids))];
  const allSubjectIds = [...new Set(requests.map((r) => r.subject_id))];
  if (!allSourceExamIds.length) return result;

  const publications = await tx.resultPublication.findMany({
    where: { exam_id: { in: allSourceExamIds }, class_id: classId, is_published: true },
    select: { exam_id: true, group_id: true },
  });
  if (!publications.length) return result;

  // group key (or "null" for an ungrouped class/subject) -> published exam ids
  const publishedByGroup = new Map<string, Set<string>>();
  for (const p of publications) {
    const key = p.group_id ?? "null";
    const set = publishedByGroup.get(key) ?? new Set<string>();
    set.add(p.exam_id);
    publishedByGroup.set(key, set);
  }
  const publishedExamIds = [...new Set(publications.map((p) => p.exam_id))];

  const [entries, subjectConfigs, students] = await Promise.all([
    tx.markEntry.findMany({
      where: { exam_id: { in: publishedExamIds }, subject_id: { in: allSubjectIds }, student_id: { in: studentIds }, is_absent: false },
      select: { exam_id: true, subject_id: true, student_id: true, marks_total: true },
    }),
    tx.examSubjectConfig.findMany({
      where: { exam_id: { in: publishedExamIds }, subject_id: { in: allSubjectIds } },
      select: { exam_id: true, subject_id: true, full_marks_theory: true, full_marks_practical: true },
    }),
    tx.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, group_id: true } }),
  ]);

  const fullMarksByExamSubject = new Map(subjectConfigs.map((c) => [`${c.exam_id}:${c.subject_id}`, c.full_marks_theory + c.full_marks_practical]));
  const groupByStudent = new Map(students.map((s) => [s.id, s.group_id]));
  // `${exam_id}:${subject_id}:${student_id}` -> percentage, resolved once
  // over the full entry set, reused by every request that references it.
  const percentageByExamSubjectStudent = new Map<string, number>();
  for (const e of entries) {
    if (e.marks_total === null) continue;
    const studentGroupKey = groupByStudent.get(e.student_id) ?? "null";
    const allowedExamIds = publishedByGroup.get(studentGroupKey ?? "null");
    if (!allowedExamIds?.has(e.exam_id)) continue;
    const fullMarks = fullMarksByExamSubject.get(`${e.exam_id}:${e.subject_id}`);
    if (!fullMarks) continue;
    percentageByExamSubjectStudent.set(`${e.exam_id}:${e.subject_id}:${e.student_id}`, (e.marks_total / fullMarks) * 100);
  }

  for (const req of requests) {
    for (const studentId of studentIds) {
      let sum = 0;
      let count = 0;
      for (const examId of req.source_exam_ids) {
        const pct = percentageByExamSubjectStudent.get(`${examId}:${req.subject_id}:${studentId}`);
        if (pct === undefined) continue;
        sum += pct;
        count += 1;
      }
      if (count > 0) result.set(`${req.component_id}:${studentId}`, { average: sum / count, count });
    }
  }
  return result;
}
