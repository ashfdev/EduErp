import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@education-erp/db";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { MARK_ENTRY_ROLES, MARK_VIEW_ROLES, MARK_APPROVAL_ROLES, RESULT_PUBLISH_ROLES } from "../../lib/roles";
import { submitMarksSchema } from "@education-erp/validators";
import { calculateGrade } from "../../utils/grading.engine";
import { computeClassResults } from "../results/results.routes";
import { sendNotification } from "../../services/notification.service";
import { createInAppNotification } from "../../services/in-app-notification.service";
import { logAudit } from "../../lib/audit-log";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { invalidateCacheNamespace } from "../../lib/cache";
import { isTeacherAssignedToSubjects, syncExpiredMarkCorrections } from "../../utils/mark-correction";
import { computeSubjectWiseAttendance } from "../../utils/subject-attendance";
import { computeAverageOfExamsFetch } from "../../utils/grade-component-average-source";

export const marksRouter = Router();
marksRouter.use(authenticate);

// A student can end up in a class that defines Groups without ever being
// assigned one (a real, observed data state, not hypothetical) — their own
// group_id genuinely is null, so a null-group ResultPublication legitimately
// matches them via the same comparison portal.routes.ts's own result lookup
// already uses (`pub.group_id === (student.group_id ?? null)`). Used both to
// decide whether getExamUnits() needs an extra "no group" unit for a class,
// and to let approve/publish accept an omitted group_id specifically for
// that unit — never for a class where every student already has a group.
async function hasUngroupedActiveStudents(classId: string): Promise<boolean> {
  return !!(await prisma.student.findFirst({ where: { current_class_id: classId, deleted_at: null, group_id: null } }));
}

// A class with Groups defined has no meaningful "whole class" publish unit —
// group_id: null would create a ResultPublication row no GROUPED student's
// own group-scoped result lookup could ever match (a silent no-op publish
// for them). Require an explicit, valid group_id whenever the class has
// Groups AND every student in it actually has one assigned; omitted
// group_id is also valid when the class has ungrouped students to cover —
// that's exactly the "no group" unit getExamUnits() adds for this case.
async function assertGroupIdForApproveOrPublish(classId: string, groupId?: string) {
  if (groupId) {
    const group = await prisma.group.findFirst({ where: { id: groupId, class_id: classId, is_active: true } });
    if (!group) throw badRequest("The selected group does not belong to this class");
    return;
  }
  const hasGroups = await prisma.group.findFirst({ where: { class_id: classId, is_active: true } });
  if (hasGroups && !(await hasUngroupedActiveStudents(classId))) {
    throw badRequest("This class has Groups/Streams — select a group to approve/publish, or use Publish Whole Campus once every group is ready");
  }
}

export interface ExamUnit {
  class_id: string;
  group_id: string | null;
}

// The set of independently-completable/publishable (class, group) units tied
// to an exam — a class with no Groups is one unit (group_id: null); a class
// with N active Groups contributes N units, one per group. Shared by the
// publish handler's completion auto-flip, the approve/publish dashboard, and
// "Publish Whole Campus".
export async function getExamUnits(examId: string): Promise<ExamUnit[]> {
  const classIds = await prisma.subject
    .findMany({ where: { exam_subject_configs: { some: { exam_id: examId } } }, select: { class_id: true }, distinct: ["class_id"] })
    .then((rows) => [...new Set(rows.map((r) => r.class_id))]);
  const groups = await prisma.group.findMany({ where: { class_id: { in: classIds }, is_active: true } });
  const groupsByClass = new Map<string, string[]>();
  for (const g of groups) {
    groupsByClass.set(g.class_id, [...(groupsByClass.get(g.class_id) ?? []), g.id]);
  }
  // Students left with no group assigned in a class that otherwise defines
  // groups still need their own completable/publishable unit — without
  // this, their marks can be entered but structurally never approved or
  // published (no unit's student query ever matches a null group_id
  // alongside real ones), a real gap this closes, not a display nicety.
  const ungroupedByClass = new Set(
    (
      await prisma.student.findMany({
        where: { current_class_id: { in: classIds }, deleted_at: null, group_id: null },
        select: { current_class_id: true },
        distinct: ["current_class_id"],
      })
    ).map((s) => s.current_class_id),
  );
  const units: ExamUnit[] = [];
  for (const classId of classIds) {
    const classGroups = groupsByClass.get(classId);
    if (classGroups && classGroups.length > 0) {
      for (const groupId of classGroups) units.push({ class_id: classId, group_id: groupId });
      if (ungroupedByClass.has(classId)) units.push({ class_id: classId, group_id: null });
    } else {
      units.push({ class_id: classId, group_id: null });
    }
  }
  return units;
}

// Eligible-subjects filter shared by approve/publish/dashboard completeness
// checks — mirrors inheritSubjectsForClass's exact rule: a subject with no
// group applies to everyone in the class; a group-scoped subject only to
// students in that same group.
function filterEligibleSubjects<T extends { group_id: string | null }>(subjects: T[], groupId: string | null): T[] {
  return subjects.filter((s) => s.group_id === null || s.group_id === groupId);
}

// Prisma's compound-unique shorthand (exam_id_class_id_group_id) requires a
// non-null group_id even though the column itself is nullable — it can't
// express "match group_id IS NULL" through that path. Upsert manually via a
// plain findFirst (which does support a null filter) instead.
async function upsertResultPublication(
  examId: string,
  classId: string,
  groupId: string | null,
  data: { is_published: boolean; published_at: Date; published_by_id: string; is_public: boolean },
) {
  const existing = await prisma.resultPublication.findFirst({ where: { exam_id: examId, class_id: classId, group_id: groupId } });
  if (existing) {
    return prisma.resultPublication.update({ where: { id: existing.id }, data });
  }
  return prisma.resultPublication.create({ data: { exam_id: examId, class_id: classId, group_id: groupId, ...data } });
}

marksRouter.get(
  "/:exam_id/:class_id/:section_id",
  authorize(MARK_VIEW_ROLES),
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    const sectionId = reqParam(req, "section_id");
    const query = z.object({ subject_id: z.string().optional() }).parse(req.query);

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw notFound("Exam not found");

    // assignedSubjectIds is populated for SUBJECT_TEACHER and CLASS_TEACHER
    // alike — null means "every subject is editable" (admin-tier roles).
    // A CLASS_TEACHER may be the section's homeroom teacher (full view
    // access, matching today's behavior) and/or separately hold a real
    // SubjectTeacherAssignment for specific subjects in this class (e.g.
    // teaching English here while being class teacher of a different
    // section) — either is enough to view the grid; assignedSubjectIds
    // drives which columns they can actually edit, not whether they can see it.
    let subjectIds: string[] | undefined;
    let assignedSubjectIds: Set<string> | null = null;
    if (req.user!.role === "CLASS_TEACHER" || req.user!.role === "SUBJECT_TEACHER") {
      const staff = await prisma.staff.findFirst({ where: { user_id: req.user!.sub } });
      const assignments = await prisma.subjectTeacherAssignment.findMany({
        where: { staff_id: staff?.id, OR: [{ section_id: sectionId }, { section_id: null }] },
      });
      assignedSubjectIds = new Set(assignments.map((a) => a.subject_id));

      if (req.user!.role === "CLASS_TEACHER") {
        const section = await prisma.section.findUnique({ where: { id: sectionId } });
        const isOwnSection = !!section && section.class_teacher_id === staff?.id;
        if (!section || (!isOwnSection && assignedSubjectIds.size === 0)) {
          throw forbidden("You are not associated with this class/section");
        }
      }
    }

    if (query.subject_id) {
      subjectIds = [query.subject_id];
    } else if (req.user!.role === "SUBJECT_TEACHER") {
      subjectIds = [...(assignedSubjectIds ?? [])];
    }
    // CLASS_TEACHER keeps seeing every subject in the class (subjectIds
    // stays undefined) — assignedSubjectIds only drives per-column editability below.

    // Only subjects this exam was actually configured for (a real
    // ExamSubjectConfig row) — without this, navigating the URL to any
    // class_id in the institution rendered a full grid for it regardless of
    // whether that class was ever selected when the exam was created,
    // falling back to a fake 100-mark default per subject since no config
    // existed to read from.
    const rawSubjects = await prisma.subject.findMany({
      where: {
        class_id: classId,
        is_active: true,
        exam_subject_configs: { some: { exam_id: examId } },
        ...(subjectIds && { id: { in: subjectIds } }),
      },
      orderBy: { created_at: "asc" },
    });
    // Defensive: two active subject rows can share a display name (only
    // (class_id, code) is unique), which would otherwise render as two
    // visually-identical columns in the grid below. orderBy above makes the
    // "which one wins" choice deterministic — the oldest row, most likely to
    // already have real MarkEntry history attached.
    const seenNames = new Set<string>();
    const subjects = rawSubjects.filter((s) => {
      const k = s.name_en.trim().toLowerCase();
      if (seenNames.has(k)) return false;
      seenNames.add(k);
      return true;
    });

    const students = await prisma.student.findMany({
      where: { current_section_id: sectionId, deleted_at: null, status: "ACTIVE" },
      orderBy: { current_roll_no: "asc" },
    });

    const entries = await prisma.markEntry.findMany({
      where: { exam_id: examId, subject_id: { in: subjects.map((s) => s.id) }, student_id: { in: students.map((s) => s.id) } },
    });
    const byKey = new Map(entries.map((e) => [`${e.student_id}:${e.subject_id}`, e]));

    // Ground truth for which subjects a student actually has (populated by
    // inheritSubjectsForClass at enrollment/promotion time) — lets the grid
    // disable cells for a subject a student isn't enrolled in (a group-scoped
    // subject outside their group, or an optional subject they never took)
    // instead of allowing a mark to be entered for it at all.
    const studentSubjectRows = await prisma.studentSubject.findMany({
      where: { student_id: { in: students.map((s) => s.id) }, subject_id: { in: subjects.map((s) => s.id) }, academic_year_id: exam.academic_year_id },
      select: { student_id: true, subject_id: true },
    });
    const enrolledByStudent = new Map<string, Set<string>>();
    for (const row of studentSubjectRows) {
      const set = enrolledByStudent.get(row.student_id) ?? new Set<string>();
      set.add(row.subject_id);
      enrolledByStudent.set(row.student_id, set);
    }

    const configs = await prisma.examSubjectConfig.findMany({ where: { exam_id: examId, subject_id: { in: subjects.map((s) => s.id) } } });
    const configBySubject = new Map(configs.map((c) => [c.subject_id, c]));

    // Direct, fixed-mark-value composition — a subject with zero rows here
    // renders exactly as it does today (marks_theory/marks_practical boxes).
    const markComponents = await prisma.examMarkComponent.findMany({
      where: { exam_id: examId, subject_id: { in: subjects.map((s) => s.id) } },
      include: { source_exams: true },
      orderBy: { display_order: "asc" },
    });
    const markComponentsBySubject = new Map<string, typeof markComponents>();
    for (const c of markComponents) {
      markComponentsBySubject.set(c.subject_id, [...(markComponentsBySubject.get(c.subject_id) ?? []), c]);
    }

    const studentIds = students.map((s) => s.id);
    // key: `${subjectId}:${componentKey}:${studentId}` -> { value, annotation }.
    // value is unscaled (a real mark, capped at the component's own
    // max_marks), never scaled against a percentage. annotation is the
    // human-readable "why" text for the red footnote under the cell (e.g.
    // "Attendance: 92% present (46/50 days)") — computed here since this is
    // the one place with all the raw source data at hand.
    const componentFetch = new Map<string, { value: number | null; annotation: string | null }>();

    const attendanceComponents = markComponents.filter((c) => c.source_type === "ATTENDANCE_PERCENTAGE");
    if (attendanceComponents.length > 0 && studentIds.length > 0) {
      const academicYear = await prisma.academicYear.findUnique({ where: { id: exam.academic_year_id } });
      const dateRange = {
        gte: exam.start_date ?? academicYear?.start_date,
        lte: exam.end_date ?? academicYear?.end_date,
      };
      const attendanceByStudent = await computeSubjectWiseAttendance(prisma, studentIds, dateRange);
      for (const c of attendanceComponents) {
        for (const studentId of studentIds) {
          const summary = attendanceByStudent.get(studentId);
          const subjectSummary = summary?.subjects.find((s) => s.subject_id === c.subject_id);
          const pct = subjectSummary?.percentage ?? 100;
          const value = Math.min(c.max_marks, Math.round(((pct / 100) * c.max_marks) * 100) / 100);
          const annotation = subjectSummary
            ? `Attendance: ${subjectSummary.percentage}% present (${subjectSummary.present}/${subjectSummary.total} days)`
            : "Attendance: no records yet";
          componentFetch.set(`${c.subject_id}:${c.key}:${studentId}`, { value, annotation });
        }
      }
    }

    const averageComponents = markComponents.filter((c) => c.source_type === "AVERAGE_OF_EXAMS" && c.source_exams.length > 0);
    if (averageComponents.length > 0 && studentIds.length > 0) {
      const averageRequests = averageComponents.map((c) => ({
        component_id: c.id,
        subject_id: c.subject_id,
        source_exam_ids: c.source_exams.map((se) => se.source_exam_id),
      }));
      const averageByKey = await computeAverageOfExamsFetch(prisma, averageRequests, classId, studentIds);
      for (const c of averageComponents) {
        for (const studentId of studentIds) {
          const resolved = averageByKey.get(`${c.id}:${studentId}`);
          const value = resolved === undefined ? null : Math.min(c.max_marks, Math.round(((resolved.average / 100) * c.max_marks) * 100) / 100);
          const annotation =
            resolved === undefined
              ? "No published source exam results yet"
              : `Average of ${resolved.count} selected exam${resolved.count === 1 ? "" : "s"}: ${Math.round(resolved.average * 10) / 10}%`;
          componentFetch.set(`${c.subject_id}:${c.key}:${studentId}`, { value, annotation });
        }
      }
    }

    // Per-subject correction_status (Plan Fourteen, Phase M) — only ever
    // meaningful once the exam is COMPLETED (mark entry is otherwise simply
    // open/editable already); "NONE" for every caller with no correction
    // history for a given subject, including every role other than the
    // calling teacher's own requests.
    const correctionStatusBySubject = new Map<string, string>();
    if (exam.status === "COMPLETED") {
      await syncExpiredMarkCorrections();
      const callerStaff = await prisma.staff.findFirst({ where: { user_id: req.user!.sub } });
      if (callerStaff) {
        const requests = await prisma.markCorrectionRequest.findMany({
          where: {
            exam_id: examId,
            teacher_id: callerStaff.id,
            subject_id: { in: subjects.map((s) => s.id) },
            OR: [{ section_id: sectionId }, { section_id: null }],
          },
          orderBy: { created_at: "desc" },
        });
        for (const r of requests) {
          if (!correctionStatusBySubject.has(r.subject_id)) {
            correctionStatusBySubject.set(r.subject_id, r.status === "APPROVED" ? "APPROVED_ACTIVE" : r.status);
          }
        }
      }
    }

    res.json({
      success: true,
      data: {
        entry_deadline_info: {
          closes_at: exam.mark_entry_closes_at,
          is_open: exam.status === "MARK_ENTRY",
          time_remaining: exam.mark_entry_closes_at ? Math.max(0, exam.mark_entry_closes_at.getTime() - Date.now()) : null,
        },
        subjects: subjects.map((s) => ({
          ...s,
          config: configBySubject.get(s.id),
          mark_components: markComponentsBySubject.get(s.id) ?? [],
          editable: assignedSubjectIds ? assignedSubjectIds.has(s.id) : true,
          correction_status: correctionStatusBySubject.get(s.id) ?? "NONE",
        })),
        students: students.map((s) => ({
          id: s.id,
          name_en: s.name_en,
          current_roll_no: s.current_roll_no,
          photo_url: s.photo_url,
          group_id: s.group_id,
          marks: Object.fromEntries(subjects.map((sub) => [sub.id, byKey.get(`${s.id}:${sub.id}`) ?? null])),
          enrolled_subject_ids: [...(enrolledByStudent.get(s.id) ?? [])],
          // Fresh auto-fetch per (subject, mark-component key) — only
          // present for AUTO-sourced components (ATTENDANCE_PERCENTAGE /
          // AVERAGE_OF_EXAMS). The client prefers an already-stored
          // is_override:true value from `marks` over this fetch; value:
          // null means "no source data yet", never a silent 0. annotation
          // is the red-footnote explanatory text, or null for a MANUAL
          // component (which has no fetch entry at all).
          component_fetch: Object.fromEntries(
            subjects
              .filter((sub) => (markComponentsBySubject.get(sub.id) ?? []).some((c) => c.source_type !== "MANUAL"))
              .map((sub) => [
                sub.id,
                Object.fromEntries(
                  (markComponentsBySubject.get(sub.id) ?? [])
                    .filter((c) => c.source_type !== "MANUAL")
                    .map((c) => [c.key, componentFetch.get(`${sub.id}:${c.key}:${s.id}`) ?? { value: null, annotation: null }]),
                ),
              ]),
          ),
        })),
      },
    });
  }),
);

marksRouter.post(
  "/submit",
  authorize(MARK_ENTRY_ROLES),
  asyncHandler(async (req, res) => {
    const body = submitMarksSchema.parse(req.body);

    const exam = await prisma.exam.findUnique({ where: { id: body.exam_id }, include: { grading_scale: { include: { ranges: true } } } });
    if (!exam) throw notFound("Exam not found");

    // Two-tier gate (Plan Fourteen, Phase M): MARK_ENTRY proceeds exactly as
    // before (including the closes_at check below); DRAFT/ACTIVE/PUBLISHED
    // stay hard-blocked exactly as before; COMPLETED gets a new narrow path
    // — only entries covered by the calling teacher's own APPROVED, still-
    // active MarkCorrectionRequest may proceed. A caller with zero approved
    // corrections sees the exact same error message as the old exam-wide
    // block, so this is byte-identical behavior for any exam/class that
    // never uses this feature.
    if (exam.status === "MARK_ENTRY") {
      if (exam.mark_entry_closes_at && exam.mark_entry_closes_at < new Date()) throw badRequest("Mark entry window has closed");
    } else if (exam.status === "COMPLETED") {
      const staff = await prisma.staff.findFirst({ where: { user_id: req.user!.sub } });
      const genericBlockMessage = "Mark entry is not open for this exam";
      if (!staff) throw badRequest(genericBlockMessage);

      const subjectIdsForGate = [...new Set(body.entries.map((e) => e.subject_id))];
      const studentIdsForGate = [...new Set(body.entries.map((e) => e.student_id))];
      const [gateSubjects, gateStudents] = await Promise.all([
        prisma.subject.findMany({ where: { id: { in: subjectIdsForGate } }, select: { id: true } }),
        prisma.student.findMany({ where: { id: { in: studentIdsForGate } }, select: { id: true, current_section_id: true } }),
      ]);
      if (gateSubjects.length !== subjectIdsForGate.length) throw badRequest(genericBlockMessage);
      const sectionByStudent = new Map(gateStudents.map((s) => [s.id, s.current_section_id]));

      await syncExpiredMarkCorrections();
      const activeCorrections = await prisma.markCorrectionRequest.findMany({
        where: {
          exam_id: body.exam_id,
          teacher_id: staff.id,
          subject_id: { in: subjectIdsForGate },
          status: "APPROVED",
        },
      });
      const coverageBySubject = new Map<string, { wholeClass: boolean; sections: Set<string> }>();
      for (const c of activeCorrections) {
        const entry = coverageBySubject.get(c.subject_id) ?? { wholeClass: false, sections: new Set<string>() };
        if (c.section_id === null) entry.wholeClass = true;
        else entry.sections.add(c.section_id);
        coverageBySubject.set(c.subject_id, entry);
      }

      const uncovered = body.entries.some((e) => {
        const coverage = coverageBySubject.get(e.subject_id);
        if (!coverage) return true;
        if (coverage.wholeClass) return false;
        const studentSection = sectionByStudent.get(e.student_id);
        return !(studentSection && coverage.sections.has(studentSection));
      });
      if (uncovered) throw badRequest(genericBlockMessage);
    } else {
      throw badRequest("Mark entry is not open for this exam");
    }

    if (req.user!.role === "SUBJECT_TEACHER" || req.user!.role === "CLASS_TEACHER") {
      const subjectIds = [...new Set(body.entries.map((e) => e.subject_id))];
      const { assigned } = await isTeacherAssignedToSubjects(req.user!.sub, subjectIds);
      if (!assigned) throw forbidden("You can only submit marks for subjects assigned to you");
    }

    const subjectIds = [...new Set(body.entries.map((e) => e.subject_id))];
    const configs = await prisma.examSubjectConfig.findMany({ where: { exam_id: body.exam_id, subject_id: { in: subjectIds } } });
    const configBySubject = new Map(configs.map((c) => [c.subject_id, c]));

    // Reject outright when the submitted subject's whole CLASS was never
    // configured for this exam at all (a class that was never selected when
    // the exam was created/edited) — distinct from the narrower, legitimate
    // case just below where the class IS in scope but one specific subject's
    // config row is missing (e.g. added to the class after the exam was
    // created), which still gets the fallback bound, not a rejection.
    const submittedSubjectsForClassCheck = await prisma.subject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, class_id: true },
    });
    const classIdsInScope = new Set(
      (
        await prisma.examSubjectConfig.findMany({
          where: { exam_id: body.exam_id },
          select: { subject: { select: { class_id: true } } },
        })
      ).map((c) => c.subject.class_id),
    );
    const outOfScope = submittedSubjectsForClassCheck.find((s) => !classIdsInScope.has(s.class_id));
    if (outOfScope) throw badRequest("This class was never configured for this exam");
    const scale = exam.grading_scale?.ranges ?? [];

    // Fallback bound for the one real edge case where no ExamSubjectConfig
    // row exists yet (e.g. a subject added to the class after this exam was
    // created) — previously that meant NO upper bound at all, letting a
    // teacher submit an unbounded mark. Falls back to the Subject's own
    // full_marks, matching what POST /api/exams/ already uses as the
    // default when it creates a config row in the normal case.
    const subjectsForFallback = await prisma.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, full_marks: true } });
    const fullMarksFallbackBySubject = new Map(subjectsForFallback.map((s) => [s.id, s.full_marks]));

    // A subject with zero rows here computes marks_total exactly as it does
    // today (marksTheory + marks_practical below); this must stay a pure
    // branch-on-existence addition, never a replacement of that flat
    // computation.
    const markComponentConfigs = await prisma.examMarkComponent.findMany({ where: { exam_id: body.exam_id, subject_id: { in: subjectIds } } });
    const markComponentsBySubject = new Map<string, typeof markComponentConfigs>();
    for (const c of markComponentConfigs) {
      markComponentsBySubject.set(c.subject_id, [...(markComponentsBySubject.get(c.subject_id) ?? []), c]);
    }

    // Needed so a resubmit that touches an already-APPROVED entry can clear
    // its now-stale approved_by_id/approved_at — otherwise a changed mark
    // would misleadingly keep showing as "approved by X at Y" after edit.
    const studentIds = [...new Set(body.entries.map((e) => e.student_id))];
    const existingEntries = await prisma.markEntry.findMany({
      where: { exam_id: body.exam_id, subject_id: { in: subjectIds }, student_id: { in: studentIds } },
      select: { student_id: true, subject_id: true, status: true },
    });
    const priorStatusByKey = new Map(existingEntries.map((e) => [`${e.student_id}:${e.subject_id}`, e.status]));

    // Structural enforcement, not just a UI restriction: a mark can only be
    // entered for a subject the student actually has (a group-scoped
    // subject outside their group, or an optional subject they never took,
    // must never be submittable even via a direct API call bypassing the
    // grid's disabled cells).
    const enrollments = await prisma.studentSubject.findMany({
      where: { student_id: { in: studentIds }, subject_id: { in: subjectIds }, academic_year_id: exam.academic_year_id },
      select: { student_id: true, subject_id: true },
    });
    const enrolledKeys = new Set(enrollments.map((e) => `${e.student_id}:${e.subject_id}`));
    const notEnrolled = body.entries.find((e) => !enrolledKeys.has(`${e.student_id}:${e.subject_id}`));
    if (notEnrolled) {
      throw badRequest("One or more students are not enrolled in the subject being submitted");
    }

    for (const entry of body.entries) {
      const config = configBySubject.get(entry.subject_id);
      const marksTheory = entry.marks_theory ?? null;
      let marksTotal = (marksTheory ?? 0) + (entry.marks_practical ?? 0);

      // When a subject has a mark composition configured, marks_total is
      // instead the flat sum of every submitted component's own value — no
      // derived/scaled piece, every named part (Theory, MCQ, Practical, CT,
      // Assignment, Attendance, whatever the admin configured) is a plain
      // peer value, capped at its own max_marks. A subject with zero rows
      // here never enters this branch — byte-identical to today.
      let componentValues: Record<string, { value: number | null; is_override: boolean }> | null = null;
      const markComponents = markComponentsBySubject.get(entry.subject_id);
      if (markComponents && markComponents.length > 0 && !entry.is_absent) {
        const configByKey = new Map(markComponents.map((c) => [c.key, c]));
        const provided = entry.component_values ?? {};
        const resolved: Record<string, { value: number | null; is_override: boolean }> = {};
        let sum = 0;
        for (const [k, v] of Object.entries(provided)) {
          const conf = configByKey.get(k);
          if (!conf) throw badRequest(`Unknown mark component "${k}" for subject`);
          if (v.value !== null) {
            if (v.value < 0 || v.value > conf.max_marks) throw badRequest(`${conf.label} must be between 0 and ${conf.max_marks}`);
            sum += v.value;
          }
          resolved[k] = { value: v.value, is_override: v.is_override };
        }
        componentValues = resolved;
        marksTotal = Math.round(sum * 100) / 100;
      }

      if (config) {
        if (marksTotal > config.full_marks_theory + config.full_marks_practical) {
          throw badRequest(`Marks for subject exceed full marks (${config.full_marks_theory + config.full_marks_practical})`);
        }
      } else {
        const fallbackFullMarks = fullMarksFallbackBySubject.get(entry.subject_id) ?? 100;
        if (marksTotal > fallbackFullMarks) {
          throw badRequest(`Marks for subject exceed full marks (${fallbackFullMarks})`);
        }
      }

      const grade = calculateGrade(marksTotal, !!entry.is_absent, scale);

      await prisma.markEntry.upsert({
        where: { exam_id_student_id_subject_id: { exam_id: body.exam_id, student_id: entry.student_id, subject_id: entry.subject_id } },
        create: {
          exam_id: body.exam_id,
          student_id: entry.student_id,
          subject_id: entry.subject_id,
          marks_theory: marksTheory,
          marks_practical: entry.marks_practical,
          component_values: componentValues ?? undefined,
          marks_total: entry.is_absent ? null : marksTotal,
          is_absent: !!entry.is_absent,
          grade_letter: grade.grade_letter,
          grade_point: grade.grade_point,
          status: "SUBMITTED",
          entered_by_id: req.user!.sub,
        },
        update: {
          marks_theory: marksTheory,
          marks_practical: entry.marks_practical,
          component_values: componentValues ?? Prisma.DbNull,
          marks_total: entry.is_absent ? null : marksTotal,
          is_absent: !!entry.is_absent,
          grade_letter: grade.grade_letter,
          grade_point: grade.grade_point,
          status: "SUBMITTED",
          entered_by_id: req.user!.sub,
          ...(priorStatusByKey.get(`${entry.student_id}:${entry.subject_id}`) === "APPROVED" && {
            approved_by_id: null,
            approved_at: null,
          }),
        },
      });
    }

    await logAudit("MARK_ENTRY_SUBMIT", { userId: req.user!.sub, targetType: "Exam", targetId: body.exam_id, metadata: { entry_count: body.entries.length }, req });
    res.json({ success: true, message: `Submitted ${body.entries.length} mark entries` });
  }),
);

marksRouter.post(
  "/approve/:exam_id/:class_id",
  authorize(MARK_APPROVAL_ROLES),
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    // Accepts group_id from either the query string or the body — the
    // sibling /publish endpoint historically only read it from the body
    // while this route only read it from the query, a real inconsistency
    // between two routes doing the conceptually identical "target this
    // class/group" operation (the shipped frontend already matches each
    // route's own convention, so this widening is purely defensive against
    // a future frontend change or a direct API call assuming symmetry).
    const query = z.object({ group_id: z.string().optional() }).parse(req.query);
    const bodyGroupId = z.object({ group_id: z.string().optional() }).parse(req.body ?? {}).group_id;
    const groupId = query.group_id ?? bodyGroupId;

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw notFound("Exam not found");
    await assertGroupIdForApproveOrPublish(classId, groupId);

    const subjects = await prisma.subject.findMany({ where: { class_id: classId, is_active: true } });
    // Explicit group_id (never a truthy-guard omission) — groupId being
    // undefined must mean "the no-group unit," matching only students whose
    // own group_id really is null, not silently every student in the class
    // once a class can have both real groups and a no-group unit at once.
    // status: "ACTIVE" -- a GRADUATED/TRANSFERRED/EXPELLED student's
    // current_class_id often still points at their last real class, but no
    // one ever enters marks for them; without this filter, one leftover
    // graduated student here makes that class's approval permanently
    // unreachable (the expected count could never be satisfied).
    const students = await prisma.student.findMany({
      where: { current_class_id: classId, status: "ACTIVE", deleted_at: null, group_id: groupId ?? null },
    });

    const entries = await prisma.markEntry.findMany({
      where: { exam_id: examId, subject_id: { in: subjects.map((s) => s.id) }, student_id: { in: students.map((s) => s.id) } },
    });

    // A flat subjects.length * students.length assumes every student takes
    // every subject in the class — true before Groups/optional-subjects
    // existed, but a group-scoped subject is structurally never taken by
    // students outside that group, which made this count permanently
    // unreachable for any class using Groups. StudentSubject is the ground
    // truth for which subjects a given student actually has (populated by
    // inheritSubjectsForClass at enrollment/promotion time), so sum each
    // student's real enrollment count instead of assuming a uniform grid.
    // When group_id is supplied, students is already narrowed to that
    // group, so this naturally only counts that group's expected entries.
    const expectedCount = await prisma.studentSubject.count({
      where: {
        student_id: { in: students.map((s) => s.id) },
        subject_id: { in: subjects.map((s) => s.id) },
        academic_year_id: exam.academic_year_id,
      },
    });
    if (entries.length < expectedCount) {
      throw badRequest(`Not all marks submitted (${entries.length}/${expectedCount}). Cannot approve yet.`);
    }

    await prisma.markEntry.updateMany({
      where: { id: { in: entries.map((e) => e.id) } },
      data: { status: "APPROVED", approved_by_id: req.user!.sub, approved_at: new Date() },
    });
    await logAudit("RESULT_APPROVE", { userId: req.user!.sub, targetType: "Exam", targetId: examId, metadata: { approved: entries.length, group_id: groupId ?? null }, req });

    res.json({ success: true, data: { approved: entries.length } });
  }),
);

marksRouter.get(
  "/publish-status/:exam_id",
  authorize(RESULT_PUBLISH_ROLES),
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw notFound("Exam not found");

    const units = await getExamUnits(examId);
    const classIds = [...new Set(units.map((u) => u.class_id))];
    const groupIds = units.map((u) => u.group_id).filter((id): id is string => !!id);

    const [classes, groups, publications] = await Promise.all([
      prisma.class.findMany({ where: { id: { in: classIds } } }),
      prisma.group.findMany({ where: { id: { in: groupIds } } }),
      prisma.resultPublication.findMany({ where: { exam_id: examId } }),
    ]);
    const classById = new Map(classes.map((c) => [c.id, c]));
    const groupById = new Map(groups.map((g) => [g.id, g]));
    const pubByKey = new Map(publications.map((p) => [`${p.class_id}:${p.group_id ?? ""}`, p]));
    // Distinguishes "this class has no Groups at all" (group_name: null,
    // renders as a plain class row) from "this is the no-group unit inside
    // an otherwise-grouped class" (group_name: "No Group", so it doesn't
    // silently look like a duplicate of the plain-class case).
    const classesWithGroups = new Set(units.filter((u) => u.group_id !== null).map((u) => u.class_id));

    // One dashboard row per (class, group) unit — a class with no Groups is
    // a single row; a class with N groups is N independent rows, each with
    // its own completion/approval/publish state.
    const data = await Promise.all(
      units.map(async (u) => {
        const subjects = filterEligibleSubjects(
          await prisma.subject.findMany({ where: { class_id: u.class_id, is_active: true } }),
          u.group_id,
        );
        // Explicit group_id (u.group_id is already string | null) — a class
        // can now have both real groups and a "no group" unit at once, so
        // omitting the filter on a falsy group_id would wrongly match every
        // student in the class, not just the ungrouped ones.
        const students = await prisma.student.findMany({
          where: { current_class_id: u.class_id, deleted_at: null, group_id: u.group_id },
        });
        const [expectedCount, entries] = await Promise.all([
          prisma.studentSubject.count({
            where: { student_id: { in: students.map((s) => s.id) }, subject_id: { in: subjects.map((s) => s.id) }, academic_year_id: exam.academic_year_id },
          }),
          prisma.markEntry.findMany({
            where: { exam_id: examId, subject_id: { in: subjects.map((s) => s.id) }, student_id: { in: students.map((s) => s.id) } },
            select: { status: true },
          }),
        ]);
        const approvedCount = entries.filter((e) => e.status === "APPROVED").length;
        const pub = pubByKey.get(`${u.class_id}:${u.group_id ?? ""}`);
        return {
          class_id: u.class_id,
          class_name: classById.get(u.class_id)?.name_en ?? "",
          group_id: u.group_id,
          group_name: u.group_id ? (groupById.get(u.group_id)?.name_en ?? "") : classesWithGroups.has(u.class_id) ? "No Group" : null,
          student_count: students.length,
          expected_count: expectedCount,
          submitted_count: entries.length,
          approved_count: approvedCount,
          is_complete: entries.length >= expectedCount,
          is_approved: expectedCount > 0 && approvedCount >= expectedCount,
          is_published: pub?.is_published ?? false,
          is_public: pub?.is_public ?? true,
          published_at: pub?.published_at ?? null,
        };
      }),
    );

    res.json({ success: true, data });
  }),
);

marksRouter.post(
  "/publish/:exam_id/:class_id",
  authorize(RESULT_PUBLISH_ROLES),
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    const body = z.object({ is_public: z.boolean().optional(), group_id: z.string().optional() }).parse(req.body);
    // Same defensive widening as /approve above — accept group_id from
    // either the body (this route's own historical convention) or the
    // query string (the sibling /approve route's convention).
    const queryGroupId = z.object({ group_id: z.string().optional() }).parse(req.query).group_id;
    // "Public on website" defaults ON — staff can already see the result
    // regardless of this flag, so the more common mistake is publishing and
    // assuming the public site updated too, not accidentally exposing it.
    const isPublic = body.is_public ?? true;
    const groupId = body.group_id ?? queryGroupId ?? null;
    await assertGroupIdForApproveOrPublish(classId, groupId ?? undefined);

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw notFound("Exam not found");

    const subjects = filterEligibleSubjects(await prisma.subject.findMany({ where: { class_id: classId, is_active: true } }), groupId);
    // See the identical note in /approve above — explicit group_id, never a
    // truthy-guard omission, and status: "ACTIVE" so a leftover
    // GRADUATED/TRANSFERRED/EXPELLED student's stale current_class_id can't
    // permanently block this class/group from ever reaching 100%.
    const students = await prisma.student.findMany({
      where: { current_class_id: classId, status: "ACTIVE", deleted_at: null, group_id: groupId ?? null },
    });
    const unapproved = await prisma.markEntry.findFirst({
      where: { exam_id: examId, subject_id: { in: subjects.map((s) => s.id) }, student_id: { in: students.map((s) => s.id) }, status: { not: "APPROVED" } },
    });
    if (unapproved) throw badRequest("All marks must be approved before publishing");

    // The check above only catches an EXISTING non-approved entry — it
    // can't catch a student who has no entry at all yet (e.g. transferred
    // into this class/section after Approve already ran, so they have a
    // fresh StudentSubject enrollment but zero MarkEntry rows). Re-run the
    // same expectedCount check Approve already does, so a roster change
    // between Approve and Publish can't let an incomplete result set
    // publish via a direct API call (the frontend button state already
    // protects normal usage, but the server must too).
    const approvedCount = await prisma.markEntry.count({
      where: { exam_id: examId, subject_id: { in: subjects.map((s) => s.id) }, student_id: { in: students.map((s) => s.id) }, status: "APPROVED" },
    });
    const expectedCount = await prisma.studentSubject.count({
      where: { student_id: { in: students.map((s) => s.id) }, subject_id: { in: subjects.map((s) => s.id) }, academic_year_id: exam.academic_year_id },
    });
    if (approvedCount < expectedCount) {
      throw badRequest(`Not all marks are approved yet (${approvedCount}/${expectedCount}). Cannot publish.`);
    }

    const publication = await upsertResultPublication(examId, classId, groupId, {
      is_published: true,
      published_at: new Date(),
      published_by_id: req.user!.sub,
      is_public: isPublic,
    });
    await logAudit("RESULT_PUBLISH", { userId: req.user!.sub, targetType: "ResultPublication", targetId: publication.id, metadata: { exam_id: examId, class_id: classId, group_id: groupId, is_public: isPublic }, req });

    // An exam can span multiple (class, group) units — only flip Exam.status
    // to PUBLISHED once every one of them has actually been published, so
    // it isn't misleadingly marked done after just one group/class.
    const units = await getExamUnits(examId);
    const publishedUnitKeys = await prisma.resultPublication
      .findMany({ where: { exam_id: examId, is_published: true }, select: { class_id: true, group_id: true } })
      .then((rows) => new Set(rows.map((r) => `${r.class_id}:${r.group_id ?? ""}`)));
    if (units.length > 0 && units.every((u) => publishedUnitKeys.has(`${u.class_id}:${u.group_id ?? ""}`))) {
      await prisma.exam.update({ where: { id: examId }, data: { status: "PUBLISHED" } });
    }
    // The public/portal lookup caches "not found" responses for 30 minutes —
    // without this, a guardian who checked before publish would keep seeing
    // a stale "not found" long after the result actually went live.
    await invalidateCacheNamespace("result-lookup");

    // Explicit comparison against the resolved group_id (never a truthy
    // "everyone matches" fallback) — correct both for a class with no
    // groups at all (every student's own group_id is null too) and for the
    // new "no group" unit inside an otherwise-grouped class.
    const perStudent = (await computeClassResults(examId, classId)).filter((p) => p.student.group_id === (groupId ?? null));
    const guardianIds = perStudent.map((p) => p.student.guardian_id).filter((id): id is string => !!id);
    const guardians = await prisma.guardian.findMany({ where: { id: { in: guardianIds } }, select: { id: true, user_id: true, email: true } });
    const guardianById = new Map(guardians.map((g) => [g.id, g]));

    for (const p of perStudent) {
      const guardian = p.student.guardian_id ? guardianById.get(p.student.guardian_id) : undefined;
      await sendNotification({
        trigger: "RESULT_PUBLISHED",
        recipients: [{ name: p.student.name_en, phone: p.student.father_phone, email: guardian?.email, user_id: guardian?.user_id, person_id: p.student.id }],
        template_data: { student_name: p.student.name_en, exam_name: exam?.name ?? "", gpa: p.result.total_gpa.toFixed(2) },
      });
      // Previously SMS/email-only — "Result Published" never showed up in the
      // guardian's/student's in-app bell, unlike Notices/Documents/Leave,
      // which already fire both. Fired for both logins when each exists.
      const recipientUserIds = [guardian?.user_id, p.student.user_id].filter((v): v is string => !!v);
      await Promise.all(
        recipientUserIds.map((userId) =>
          createInAppNotification({ userId, type: "RESULT_PUBLISHED", title: `Result published: ${exam?.name ?? ""}`, body: `${p.student.name_en} — GPA ${p.result.total_gpa.toFixed(2)}`, link: "/results" }),
        ),
      );
    }

    res.json({ success: true, data: publication });
  }),
);

marksRouter.post(
  "/publish-whole-campus/:exam_id",
  authorize(RESULT_PUBLISH_ROLES),
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw notFound("Exam not found");

    const units = await getExamUnits(examId);
    const alreadyPublished = await prisma.resultPublication
      .findMany({ where: { exam_id: examId, is_published: true }, select: { class_id: true, group_id: true } })
      .then((rows) => new Set(rows.map((r) => `${r.class_id}:${r.group_id ?? ""}`)));
    const pending = units.filter((u) => !alreadyPublished.has(`${u.class_id}:${u.group_id ?? ""}`));

    const published: ExamUnit[] = [];
    const failed: (ExamUnit & { reason: string })[] = [];
    for (const unit of pending) {
      try {
        const subjects = filterEligibleSubjects(await prisma.subject.findMany({ where: { class_id: unit.class_id, is_active: true } }), unit.group_id);
        // See the identical note on the dashboard route above — explicit
        // group_id, never a truthy-guard omission.
        const students = await prisma.student.findMany({
          where: { current_class_id: unit.class_id, deleted_at: null, group_id: unit.group_id },
        });
        const unapproved = await prisma.markEntry.findFirst({
          where: { exam_id: examId, subject_id: { in: subjects.map((s) => s.id) }, student_id: { in: students.map((s) => s.id) }, status: { not: "APPROVED" } },
        });
        if (unapproved) throw new Error("Not all marks are approved yet");

        const publication = await upsertResultPublication(examId, unit.class_id, unit.group_id, {
          is_published: true,
          published_at: new Date(),
          published_by_id: req.user!.sub,
          is_public: true,
        });
        await logAudit("RESULT_PUBLISH", {
          userId: req.user!.sub,
          targetType: "ResultPublication",
          targetId: publication.id,
          metadata: { exam_id: examId, class_id: unit.class_id, group_id: unit.group_id, is_public: true, via: "publish_whole_campus" },
          req,
        });

        // See the identical note in /publish above.
        const perStudent = (await computeClassResults(examId, unit.class_id)).filter((p) => p.student.group_id === unit.group_id);
        const guardianIds = perStudent.map((p) => p.student.guardian_id).filter((id): id is string => !!id);
        const guardians = await prisma.guardian.findMany({ where: { id: { in: guardianIds } }, select: { id: true, user_id: true, email: true } });
        const guardianById = new Map(guardians.map((g) => [g.id, g]));
        for (const p of perStudent) {
          const guardian = p.student.guardian_id ? guardianById.get(p.student.guardian_id) : undefined;
          await sendNotification({
            trigger: "RESULT_PUBLISHED",
            recipients: [{ name: p.student.name_en, phone: p.student.father_phone, email: guardian?.email, user_id: guardian?.user_id, person_id: p.student.id }],
            template_data: { student_name: p.student.name_en, exam_name: exam.name, gpa: p.result.total_gpa.toFixed(2) },
          });
          const recipientUserIds = [guardian?.user_id, p.student.user_id].filter((v): v is string => !!v);
          await Promise.all(
            recipientUserIds.map((userId) =>
              createInAppNotification({ userId, type: "RESULT_PUBLISHED", title: `Result published: ${exam.name}`, body: `${p.student.name_en} — GPA ${p.result.total_gpa.toFixed(2)}`, link: "/results" }),
            ),
          );
        }
        published.push(unit);
      } catch (err) {
        // One unit's failure (e.g. still has unapproved marks) must not
        // block the others — report it and keep going, matching this
        // project's established per-unit-isolation discipline.
        failed.push({ ...unit, reason: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    if (published.length > 0) {
      const nowPublished = await prisma.resultPublication
        .findMany({ where: { exam_id: examId, is_published: true }, select: { class_id: true, group_id: true } })
        .then((rows) => new Set(rows.map((r) => `${r.class_id}:${r.group_id ?? ""}`)));
      if (units.length > 0 && units.every((u) => nowPublished.has(`${u.class_id}:${u.group_id ?? ""}`))) {
        await prisma.exam.update({ where: { id: examId }, data: { status: "PUBLISHED" } });
      }
      await invalidateCacheNamespace("result-lookup");
    }

    res.json({ success: true, data: { published, failed, already_published: units.length - pending.length } });
  }),
);
