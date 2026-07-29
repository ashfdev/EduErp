import { Router } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { publicEndpointLimiter } from "../../middleware/rate-limit";
import { cached } from "../../lib/cache";
import { reqParam } from "../../lib/req-param";
import { STAFF_ONLY_ROLES, MARK_VIEW_ROLES, RESULT_PUBLISH_ROLES } from "../../lib/roles";
import { calculateStudentResult, calculatePositions } from "../../utils/grading.engine";
import { badRequest, notFound } from "../../lib/errors";

export const resultsRouter = Router();

// groupId is optional and purely additive (Plan Fifteen, Phase A) — when
// omitted, every call site behaves byte-identically to before this param
// existed (every group's students mixed into one roster, the original,
// still-latent bug for any class-level report that doesn't pass it). When
// supplied, the roster itself is scoped to that group, on top of the
// per-subject group eligibility filter below (which already existed and
// only ever affected which SUBJECTS counted for a student already in the
// roster, not who was in the roster to begin with).
export async function computeClassResults(examId: string, classId: string, groupId?: string) {
  const [exam, subjects, students, institutionConfig] = await Promise.all([
    prisma.exam.findUnique({ where: { id: examId }, include: { grading_scale: { include: { ranges: true } } } }),
    prisma.subject.findMany({ where: { class_id: classId, is_active: true } }),
    prisma.student.findMany({
      // status: "ACTIVE" -- a GRADUATED/TRANSFERRED/EXPELLED student's
      // current_class_id often still points at their last real class; left
      // unfiltered, they'd be counted in class averages/positions and drag
      // both down for every other student's report card (see the identical
      // fix applied to the approve/publish completeness checks).
      where: { current_class_id: classId, status: "ACTIVE", deleted_at: null, ...(groupId && { group_id: groupId }) },
      orderBy: { current_roll_no: "asc" },
    }),
    prisma.institutionConfig.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!exam) throw notFound("Exam not found");

  const entries = await prisma.markEntry.findMany({
    where: { exam_id: examId, subject_id: { in: subjects.map((s) => s.id) }, student_id: { in: students.map((s) => s.id) } },
  });
  // Ground truth for which OPTIONAL subject each student actually takes —
  // without this, an optional subject the student never enrolled in was
  // previously still included (via the whole-class eligibility list below)
  // and scored as a silent absence/fail, purely because it existed
  // somewhere in the class's subject list. Compulsory subjects don't need
  // this — class-level inheritance already guarantees everyone has them.
  // Also carries which one (if any) is this student's own designated BD
  // "4th subject" for the GPA bonus rule.
  const studentSubjectRows = await prisma.studentSubject.findMany({
    where: { student_id: { in: students.map((s) => s.id) }, subject_id: { in: subjects.map((s) => s.id) }, academic_year_id: exam.academic_year_id },
    select: { student_id: true, subject_id: true, is_fourth_subject: true },
  });
  const enrolledOptionalByStudent = new Map<string, Map<string, boolean>>();
  for (const row of studentSubjectRows) {
    const m = enrolledOptionalByStudent.get(row.student_id) ?? new Map<string, boolean>();
    m.set(row.subject_id, row.is_fourth_subject);
    enrolledOptionalByStudent.set(row.student_id, m);
  }
  const scale = exam.grading_scale?.ranges ?? [];

  const perStudent = students.map((student) => {
    const studentEntries = entries.filter((e) => e.student_id === student.id);
    // A subject scoped to a Group other than the student's own must never
    // count toward their result — otherwise every student in a grouped
    // class would be evaluated against every other group's subjects too,
    // showing as "absent" (and therefore failed) in every one of them.
    // Mirrors inheritSubjectsForClass's exact eligibility rule: shared
    // (group_id null) or the student's own group. An optional subject is
    // further filtered to only the ones this specific student actually
    // enrolled in (see studentSubjectRows above).
    const optionalEnrollment = enrolledOptionalByStudent.get(student.id) ?? new Map<string, boolean>();
    const eligibleSubjects = subjects.filter(
      (s) => (s.group_id === null || s.group_id === student.group_id) && (!s.is_optional || optionalEnrollment.has(s.id)),
    );
    const subjectInputs = eligibleSubjects.map((s) => {
      const entry = studentEntries.find((e) => e.subject_id === s.id);
      return {
        subject_id: s.id,
        subject_name: s.name_en,
        is_optional: s.is_optional,
        is_fourth_subject: optionalEnrollment.get(s.id) ?? false,
        marks_total: entry?.marks_total ?? null,
        is_absent: entry?.is_absent ?? true,
      };
    });
    const result = calculateStudentResult(subjectInputs, scale, institutionConfig?.fourth_subject_rule ?? false);
    const totalMarks = result.subjects.reduce((sum, s) => sum + (s.marks_total ?? 0), 0);
    return { student, result, total_marks: totalMarks };
  });

  const positioned = calculatePositions(perStudent.map((p) => ({ student_id: p.student.id, total_gpa: p.result.total_gpa, total_marks: p.total_marks })));
  const positionByStudent = new Map(positioned.map((p) => [p.student_id, p.position]));

  return perStudent.map((p) => ({ ...p, position: positionByStudent.get(p.student.id) ?? null }));
}

// Staff-only lookup of a specific student's result history. Portal callers
// (STUDENT/GUARDIAN) must go through the ownership-checked
// GET /api/portal/student/:id/results instead — this route trusted the :id
// param with no ownership check, letting any portal token pull up any
// other student's results.
resultsRouter.get(
  "/student/:id",
  authenticate,
  authorize(STAFF_ONLY_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const query = z.object({ academic_year_id: z.string().optional() }).parse(req.query);

    const publications = await prisma.resultPublication.findMany({
      where: { is_published: true, ...(query.academic_year_id && { exam: { academic_year_id: query.academic_year_id } }) },
      include: { exam: { include: { grading_scale: { include: { ranges: true } } } } },
    });

    const student = await prisma.student.findUnique({ where: { id } });
    if (!student) throw notFound("Student not found");
    const institutionConfig = await prisma.institutionConfig.findUnique({ where: { id: "singleton" } });

    const results = [];
    for (const pub of publications) {
      if (pub.class_id !== student.current_class_id) continue;
      // A grouped class's groups publish independently (Phase 75) — a
      // null-group publication only matches an ungrouped student, and a
      // specific group's publication only matches a student currently in
      // that same group. Uses the student's CURRENT group_id (Groups are
      // per-class-scoped and already go stale on class change elsewhere in
      // this feature; no historical per-year group record exists).
      if (pub.group_id !== (student.group_id ?? null)) continue;
      const entries = await prisma.markEntry.findMany({ where: { exam_id: pub.exam_id, student_id: id }, include: { subject: true } });
      if (!entries.length) continue;
      const fourthRows = await prisma.studentSubject.findMany({
        where: { student_id: id, academic_year_id: pub.exam.academic_year_id, is_fourth_subject: true },
        select: { subject_id: true },
      });
      const fourthSubjectIds = new Set(fourthRows.map((r) => r.subject_id));
      const subjectInputs = entries.map((e) => ({
        subject_id: e.subject_id,
        subject_name: e.subject.name_en,
        is_optional: e.subject.is_optional,
        is_fourth_subject: fourthSubjectIds.has(e.subject_id),
        marks_total: e.marks_total,
        is_absent: e.is_absent,
      }));
      const result = calculateStudentResult(subjectInputs, pub.exam.grading_scale?.ranges ?? [], institutionConfig?.fourth_subject_rule ?? false);
      results.push({ exam: pub.exam, subjects_with_marks: entries, overall_gpa: result.total_gpa, overall_grade: result.overall_grade_letter });
    }

    res.json({ success: true, data: results });
  }),
);

resultsRouter.get(
  "/exam/:exam_id",
  authenticate,
  authorize(MARK_VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const query = z.object({ class_id: z.string().min(1), section_id: z.string().optional(), group_id: z.string().optional() }).parse(req.query);

    let results = await computeClassResults(examId, query.class_id, query.group_id);
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
        academic_year_id: z.string().optional(),
      })
      .parse(req.query);

    if (!query.student_uid && !(query.roll_no && query.registration_no)) {
      throw badRequest("Provide either student_uid, or both roll_no and registration_no");
    }

    const cacheKey = `result-lookup:${query.student_uid ?? `${query.roll_no}:${query.registration_no}`}:${query.exam_id ?? "all"}:${query.academic_year_id ?? ""}`;
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
        where: {
          is_published: true,
          is_public: true,
          ...(query.exam_id && { exam_id: query.exam_id }),
          ...(query.academic_year_id && {
            exam: { academic_year_id: query.academic_year_id },
          }),
        },
        include: { exam: { include: { grading_scale: { include: { ranges: true } } } } },
      });
      const publications = candidatePublications.filter((pub) => {
        const resolvedClassId = classForYear.get(pub.exam.academic_year_id) ?? student.current_class_id;
        if (resolvedClassId !== pub.class_id) return false;
        // See the identical group-matching note in /student/:id above —
        // same current-group-id comparison, same known limitation.
        return pub.group_id === (student.group_id ?? null);
      });

      const institutionConfig = await prisma.institutionConfig.findUnique({ where: { id: "singleton" } });
      const results = [];
      for (const pub of publications) {
        const entries = await prisma.markEntry.findMany({ where: { exam_id: pub.exam_id, student_id: student.id }, include: { subject: true } });
        if (!entries.length) continue;
        const fourthRows = await prisma.studentSubject.findMany({
          where: { student_id: student.id, academic_year_id: pub.exam.academic_year_id, is_fourth_subject: true },
          select: { subject_id: true },
        });
        const fourthSubjectIds = new Set(fourthRows.map((r) => r.subject_id));
        const subjectInputs = entries.map((e) => ({
          subject_id: e.subject_id,
          subject_name: e.subject.name_en,
          is_optional: e.subject.is_optional,
          is_fourth_subject: fourthSubjectIds.has(e.subject_id),
          marks_total: e.marks_total,
          is_absent: e.is_absent,
        }));
        const result = calculateStudentResult(subjectInputs, pub.exam.grading_scale?.ranges ?? [], institutionConfig?.fourth_subject_rule ?? false);
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

// Public seat-plan lookup — same identity bar as /public/lookup above
// (either the student_uid, or both roll_no + registration_no), so a
// student/guardian can check "which hall/room/seat am I in" without
// needing to log in to the portal.
resultsRouter.get(
  "/public/seat-plan",
  publicEndpointLimiter,
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        student_uid: z.string().optional(),
        roll_no: z.string().optional(),
        registration_no: z.string().optional(),
      })
      .parse(req.query);

    if (!query.student_uid && !(query.roll_no && query.registration_no)) {
      throw badRequest("Provide either student_uid, or both roll_no and registration_no");
    }

    const cacheKey = `seat-plan-lookup:${query.student_uid ?? `${query.roll_no}:${query.registration_no}`}`;
    const data = await cached(cacheKey, 5 * 60, async () => {
      const student = await prisma.student.findFirst({
        where: query.student_uid ? { student_uid: query.student_uid } : { current_roll_no: query.roll_no, registration_no: query.registration_no },
      });
      if (!student) return { found: false };

      const plans = await prisma.examSeatPlan.findMany({
        where: { student_id: student.id },
        include: {
          exam: { select: { name: true, start_date: true } },
          session: { select: { label: true, date: true, start_time: true, end_time: true } },
          hall: { select: { name: true, room_number: true, floor: true } },
        },
        orderBy: { exam: { start_date: "desc" } },
      });

      return {
        found: true,
        student_name: student.name_en,
        student_uid: student.student_uid,
        seat_plans: plans.map((p) => ({
          exam_name: p.exam.name,
          session_label: p.session?.label ?? null,
          session_date: p.session?.date ?? null,
          start_time: p.session?.start_time ?? null,
          end_time: p.session?.end_time ?? null,
          hall_name: p.hall?.name ?? p.hall_name,
          room_number: p.hall?.room_number ?? null,
          floor: p.hall?.floor ?? null,
          row_number: p.row_number,
          seat_in_row: p.seat_in_row,
        })),
      };
    });

    res.json({ success: true, data });
  }),
);

resultsRouter.get(
  "/tabulation/:exam_id/:class_id",
  authenticate,
  authorize(MARK_VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    const groupId = typeof req.query.group_id === "string" ? req.query.group_id : undefined;
    const sectionId = typeof req.query.section_id === "string" ? req.query.section_id : undefined;
    // A group-scoped subject must never appear as a column when the sheet
    // is for a DIFFERENT group than its own -- otherwise every student in a
    // grouped class shows blank cells for every other group's subjects.
    // Omitting group_id stays byte-identical to before this param existed
    // (every group's subjects mixed together, the original class-level
    // behavior every non-grouped class already relies on). is_active: true
    // -- a deactivated subject must never appear as a column.
    const subjects = await prisma.subject.findMany({
      where: { class_id: classId, is_active: true, ...(groupId && { OR: [{ group_id: null }, { group_id: groupId }] }) },
    });
    const allResults = await computeClassResults(examId, classId, groupId);
    // Section and Group are independent axes -- both narrow together.
    const results = sectionId ? allResults.filter((r) => r.student.current_section_id === sectionId) : allResults;

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
  "/tabulation/:exam_id/:class_id/export",
  authenticate,
  authorize(MARK_VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    const groupId = typeof req.query.group_id === "string" ? req.query.group_id : undefined;
    const sectionId = typeof req.query.section_id === "string" ? req.query.section_id : undefined;
    const [subjects, klass, allResults] = await Promise.all([
      prisma.subject.findMany({ where: { class_id: classId, is_active: true, ...(groupId && { OR: [{ group_id: null }, { group_id: groupId }] }) } }),
      prisma.class.findUnique({ where: { id: classId } }),
      computeClassResults(examId, classId, groupId),
    ]);
    const results = sectionId ? allResults.filter((r) => r.student.current_section_id === sectionId) : allResults;
    const sorted = results.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Tabulation");
    sheet.columns = [
      { header: "Roll No", key: "roll_no", width: 10 },
      { header: "Name", key: "name_en", width: 24 },
      ...subjects.map((s) => ({ header: s.name_en, key: s.id, width: 14 })),
      { header: "Total GPA", key: "total_gpa", width: 12 },
      { header: "Grade", key: "overall_grade", width: 10 },
      { header: "Position", key: "position", width: 10 },
    ];
    for (const r of sorted) {
      const marksBySubject = Object.fromEntries(r.result.subjects.map((s) => [s.subject_id, s.marks_total]));
      sheet.addRow({
        roll_no: r.student.current_roll_no,
        name_en: r.student.name_en,
        ...marksBySubject,
        total_gpa: r.result.total_gpa,
        overall_grade: r.result.overall_grade_letter,
        position: r.position,
      });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Tabulation_${klass?.name_en ?? classId}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  }),
);

resultsRouter.get(
  "/reports/merit-list/:exam_id/:class_id",
  authenticate,
  authorize(MARK_VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    const groupId = typeof req.query.group_id === "string" ? req.query.group_id : undefined;
    const sectionId = typeof req.query.section_id === "string" ? req.query.section_id : undefined;
    const allResults = await computeClassResults(examId, classId, groupId);
    const results = sectionId ? allResults.filter((r) => r.student.current_section_id === sectionId) : allResults;
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
  "/reports/merit-list/:exam_id/:class_id/export",
  authenticate,
  authorize(MARK_VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    const groupId = typeof req.query.group_id === "string" ? req.query.group_id : undefined;
    const sectionId = typeof req.query.section_id === "string" ? req.query.section_id : undefined;
    const [klass, allResults] = await Promise.all([prisma.class.findUnique({ where: { id: classId } }), computeClassResults(examId, classId, groupId)]);
    const results = sectionId ? allResults.filter((r) => r.student.current_section_id === sectionId) : allResults;
    const merit = results
      .filter((r) => !r.result.has_failed)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Merit List");
    sheet.columns = [
      { header: "Rank", key: "rank", width: 8 },
      { header: "Roll No", key: "roll_no", width: 10 },
      { header: "Name", key: "name_en", width: 24 },
      { header: "Student ID", key: "student_uid", width: 18 },
      { header: "Total GPA", key: "total_gpa", width: 12 },
    ];
    for (const r of merit) {
      sheet.addRow({ rank: r.position, roll_no: r.student.current_roll_no, name_en: r.student.name_en, student_uid: r.student.student_uid, total_gpa: r.result.total_gpa });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Merit_List_${klass?.name_en ?? classId}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  }),
);

resultsRouter.get(
  "/reports/subject-analysis/:exam_id/:class_id",
  authenticate,
  authorize(MARK_VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    const groupId = typeof req.query.group_id === "string" ? req.query.group_id : undefined;
    const sectionId = typeof req.query.section_id === "string" ? req.query.section_id : undefined;
    // Filtering the SUBJECT list to the requested group is sufficient for
    // the group axis (unlike computeClassResults, this route never touches
    // the student roster directly) -- a group-scoped subject only ever has
    // MarkEntry rows from that group's own students in the first place
    // (inheritSubjectsForClass only ever enrolls a student into a subject
    // whose group_id is null or their own), so once the subject itself is
    // correctly scoped, its entries already are too. Section is a separate
    // axis (a section can have mixed groups) and DOES need an explicit
    // student_id restriction, since a subject's own scoping says nothing
    // about which section its enrolled students happen to be in.
    const subjects = await prisma.subject.findMany({
      where: { class_id: classId, is_active: true, ...(groupId && { OR: [{ group_id: null }, { group_id: groupId }] }) },
    });
    const sectionStudentIds = sectionId
      ? await prisma.student.findMany({ where: { current_class_id: classId, current_section_id: sectionId, deleted_at: null, status: "ACTIVE" }, select: { id: true } }).then((rows) => rows.map((r) => r.id))
      : undefined;
    const entries = await prisma.markEntry.findMany({
      where: { exam_id: examId, subject_id: { in: subjects.map((s) => s.id) }, ...(sectionStudentIds && { student_id: { in: sectionStudentIds } }) },
    });

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
  authorize(RESULT_PUBLISH_ROLES),
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const publications = await prisma.resultPublication.findMany({ where: { exam_id: examId }, include: { exam: true } });

    const summary = [];
    for (const pub of publications) {
      const [klass, group] = await Promise.all([
        prisma.class.findUnique({ where: { id: pub.class_id } }),
        pub.group_id ? prisma.group.findUnique({ where: { id: pub.group_id } }) : Promise.resolve(null),
      ]);
      // A grouped class has one publication row per group — computeClassResults
      // returns every student in the class, so narrow to just this
      // publication's own group to avoid double-counting a class with
      // multiple groups (once per group's row).
      const classResults = await computeClassResults(examId, pub.class_id);
      const results = pub.group_id ? classResults.filter((r) => r.student.group_id === pub.group_id) : classResults;
      const passed = results.filter((r) => !r.result.has_failed).length;
      summary.push({
        class_id: pub.class_id,
        class_name: klass?.name_en,
        group_id: pub.group_id,
        group_name: group?.name_en ?? null,
        total_students: results.length,
        passed,
        pass_rate: results.length ? Math.round((passed / results.length) * 1000) / 10 : null,
      });
    }

    res.json({ success: true, data: summary });
  }),
);
