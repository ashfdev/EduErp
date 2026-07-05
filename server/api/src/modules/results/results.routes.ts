import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { publicEndpointLimiter } from "../../middleware/rate-limit";
import { cached } from "../../lib/cache";
import { reqParam } from "../../lib/req-param";
import { calculateStudentResult, calculatePositions } from "../../utils/grading.engine";
import { badRequest, notFound } from "../../lib/errors";

export const resultsRouter = Router();

export async function computeClassResults(examId: string, classId: string) {
  const [exam, subjects, students] = await Promise.all([
    prisma.exam.findUnique({ where: { id: examId }, include: { grading_scale: { include: { ranges: true } } } }),
    prisma.subject.findMany({ where: { class_id: classId } }),
    prisma.student.findMany({ where: { current_class_id: classId, deleted_at: null }, orderBy: { current_roll_no: "asc" } }),
  ]);
  if (!exam) throw notFound("Exam not found");

  const entries = await prisma.markEntry.findMany({
    where: { exam_id: examId, subject_id: { in: subjects.map((s) => s.id) }, student_id: { in: students.map((s) => s.id) } },
  });
  const scale = exam.grading_scale?.ranges ?? [];

  const perStudent = students.map((student) => {
    const studentEntries = entries.filter((e) => e.student_id === student.id);
    const subjectInputs = subjects.map((s) => {
      const entry = studentEntries.find((e) => e.subject_id === s.id);
      return { subject_id: s.id, subject_name: s.name_en, is_optional: s.is_optional, marks_total: entry?.marks_total ?? null, is_absent: entry?.is_absent ?? true };
    });
    const result = calculateStudentResult(subjectInputs, scale, false);
    const totalMarks = result.subjects.reduce((sum, s) => sum + (s.marks_total ?? 0), 0);
    return { student, result, total_marks: totalMarks };
  });

  const positioned = calculatePositions(perStudent.map((p) => ({ student_id: p.student.id, total_gpa: p.result.total_gpa, total_marks: p.total_marks })));
  const positionByStudent = new Map(positioned.map((p) => [p.student_id, p.position]));

  return perStudent.map((p) => ({ ...p, position: positionByStudent.get(p.student.id) ?? null }));
}

resultsRouter.get(
  "/student/:id",
  authenticate,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const query = z.object({ academic_year_id: z.string().optional() }).parse(req.query);

    const publications = await prisma.resultPublication.findMany({
      where: { is_published: true, ...(query.academic_year_id && { exam: { academic_year_id: query.academic_year_id } }) },
      include: { exam: { include: { grading_scale: { include: { ranges: true } } } } },
    });

    const student = await prisma.student.findUnique({ where: { id } });
    if (!student) throw notFound("Student not found");

    const results = [];
    for (const pub of publications) {
      if (pub.class_id !== student.current_class_id) continue;
      const entries = await prisma.markEntry.findMany({ where: { exam_id: pub.exam_id, student_id: id }, include: { subject: true } });
      if (!entries.length) continue;
      const subjectInputs = entries.map((e) => ({ subject_id: e.subject_id, subject_name: e.subject.name_en, is_optional: e.subject.is_optional, marks_total: e.marks_total, is_absent: e.is_absent }));
      const result = calculateStudentResult(subjectInputs, pub.exam.grading_scale?.ranges ?? [], false);
      results.push({ exam: pub.exam, subjects_with_marks: entries, overall_gpa: result.total_gpa, overall_grade: result.overall_grade_letter });
    }

    res.json({ success: true, data: results });
  }),
);

resultsRouter.get(
  "/exam/:exam_id",
  authenticate,
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const query = z.object({ class_id: z.string().min(1), section_id: z.string().optional() }).parse(req.query);

    let results = await computeClassResults(examId, query.class_id);
    if (query.section_id) results = results.filter((r) => r.student.current_section_id === query.section_id);

    res.json({
      success: true,
      data: results
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((r) => ({
          student_id: r.student.id,
          student_uid: r.student.student_uid,
          name_en: r.student.name_en,
          roll_no: r.student.current_roll_no,
          subjects: r.result.subjects,
          total_gpa: r.result.total_gpa,
          overall_grade: r.result.overall_grade_letter,
          has_failed: r.result.has_failed,
          position: r.position,
        })),
    });
  }),
);

resultsRouter.get(
  "/public/lookup",
  publicEndpointLimiter,
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        student_uid: z.string().optional(),
        roll_no: z.string().optional(),
        registration_no: z.string().optional(),
        exam_id: z.string().optional(),
      })
      .parse(req.query);

    if (!query.student_uid && !(query.roll_no && query.registration_no)) {
      throw badRequest("Provide either student_uid, or both roll_no and registration_no");
    }

    const cacheKey = `result-lookup:${query.student_uid ?? `${query.roll_no}:${query.registration_no}`}:${query.exam_id ?? "all"}`;
    const data = await cached(cacheKey, 30 * 60, async () => {
      const student = await prisma.student.findFirst({
        where: query.student_uid ? { student_uid: query.student_uid } : { current_roll_no: query.roll_no, registration_no: query.registration_no },
      });
      if (!student) return { found: false };

      // A student's class at the time of an exam may differ from their
      // current class if they've since been promoted — resolve per-exam via
      // StudentAcademicHistory instead of always trusting current_class_id,
      // otherwise a promoted student's older published result "disappears".
      const histories = await prisma.studentAcademicHistory.findMany({ where: { student_id: student.id } });
      const classForYear = new Map(histories.map((h) => [h.academic_year_id, h.class_id]));

      const candidatePublications = await prisma.resultPublication.findMany({
        where: { is_published: true, is_public: true, ...(query.exam_id && { exam_id: query.exam_id }) },
        include: { exam: { include: { grading_scale: { include: { ranges: true } } } } },
      });
      const publications = candidatePublications.filter((pub) => {
        const resolvedClassId = classForYear.get(pub.exam.academic_year_id) ?? student.current_class_id;
        return resolvedClassId === pub.class_id;
      });

      const results = [];
      for (const pub of publications) {
        const entries = await prisma.markEntry.findMany({ where: { exam_id: pub.exam_id, student_id: student.id }, include: { subject: true } });
        if (!entries.length) continue;
        const subjectInputs = entries.map((e) => ({ subject_id: e.subject_id, subject_name: e.subject.name_en, is_optional: e.subject.is_optional, marks_total: e.marks_total, is_absent: e.is_absent }));
        const result = calculateStudentResult(subjectInputs, pub.exam.grading_scale?.ranges ?? [], false);
        results.push({
          exam_name: pub.exam.name,
          subjects: entries.map((e) => ({ subject_name: e.subject.name_en, marks_total: e.marks_total, grade_letter: e.grade_letter, is_absent: e.is_absent })),
          gpa: result.total_gpa,
          grade: result.overall_grade_letter,
          has_failed: result.has_failed,
        });
      }

      return { found: true, student_name: student.name_en, student_uid: student.student_uid, results };
    });

    res.json({ success: true, data });
  }),
);

resultsRouter.get(
  "/tabulation/:exam_id/:class_id",
  authenticate,
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    const subjects = await prisma.subject.findMany({ where: { class_id: classId } });
    const results = await computeClassResults(examId, classId);

    res.json({
      success: true,
      data: {
        subjects: subjects.map((s) => ({ id: s.id, name_en: s.name_en })),
        rows: results
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((r) => ({
            roll_no: r.student.current_roll_no,
            name_en: r.student.name_en,
            marks_by_subject: Object.fromEntries(r.result.subjects.map((s) => [s.subject_id, s.marks_total])),
            total_gpa: r.result.total_gpa,
            overall_grade: r.result.overall_grade_letter,
            position: r.position,
          })),
      },
    });
  }),
);

resultsRouter.get(
  "/reports/merit-list/:exam_id/:class_id",
  authenticate,
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    const results = await computeClassResults(examId, classId);
    res.json({
      success: true,
      data: results
        .filter((r) => !r.result.has_failed)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((r) => ({ rank: r.position, roll_no: r.student.current_roll_no, name_en: r.student.name_en, student_uid: r.student.student_uid, total_gpa: r.result.total_gpa })),
    });
  }),
);

resultsRouter.get(
  "/reports/subject-analysis/:exam_id/:class_id",
  authenticate,
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    const subjects = await prisma.subject.findMany({ where: { class_id: classId } });
    const entries = await prisma.markEntry.findMany({ where: { exam_id: examId, subject_id: { in: subjects.map((s) => s.id) } } });

    const analysis = subjects.map((s) => {
      const subjectEntries = entries.filter((e) => e.subject_id === s.id);
      const appeared = subjectEntries.filter((e) => !e.is_absent);
      const passed = appeared.filter((e) => (e.marks_total ?? 0) >= s.pass_marks);
      const avg = appeared.length ? appeared.reduce((sum, e) => sum + (e.marks_total ?? 0), 0) / appeared.length : 0;
      return {
        subject_id: s.id,
        subject_name: s.name_en,
        appeared: appeared.length,
        passed: passed.length,
        pass_rate: appeared.length ? Math.round((passed.length / appeared.length) * 1000) / 10 : null,
        average_marks: Math.round(avg * 10) / 10,
      };
    });

    res.json({ success: true, data: analysis });
  }),
);

resultsRouter.get(
  "/reports/campus-wide/:exam_id",
  authenticate,
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const publications = await prisma.resultPublication.findMany({ where: { exam_id: examId }, include: { exam: true } });

    const summary = [];
    for (const pub of publications) {
      const klass = await prisma.class.findUnique({ where: { id: pub.class_id } });
      const results = await computeClassResults(examId, pub.class_id);
      const passed = results.filter((r) => !r.result.has_failed).length;
      summary.push({
        class_id: pub.class_id,
        class_name: klass?.name_en,
        total_students: results.length,
        passed,
        pass_rate: results.length ? Math.round((passed / results.length) * 1000) / 10 : null,
      });
    }

    res.json({ success: true, data: summary });
  }),
);
