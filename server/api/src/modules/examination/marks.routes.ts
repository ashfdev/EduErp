import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { MARK_ENTRY_ROLES, MARK_APPROVAL_ROLES, RESULT_PUBLISH_ROLES } from "../../lib/roles";
import { submitMarksSchema } from "@education-erp/validators";
import { calculateGrade } from "../../utils/grading.engine";
import { badRequest, forbidden, notFound } from "../../lib/errors";

export const marksRouter = Router();
marksRouter.use(authenticate);

marksRouter.get(
  "/:exam_id/:class_id/:section_id",
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    const sectionId = reqParam(req, "section_id");
    const query = z.object({ subject_id: z.string().optional() }).parse(req.query);

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw notFound("Exam not found");

    let subjectIds: string[] | undefined;
    if (query.subject_id) {
      subjectIds = [query.subject_id];
    } else if (req.user!.role === "SUBJECT_TEACHER") {
      const assignments = await prisma.subjectTeacherAssignment.findMany({
        where: { staff: { user_id: req.user!.sub }, OR: [{ section_id: sectionId }, { section_id: null }] },
      });
      subjectIds = assignments.map((a) => a.subject_id);
    }

    const subjects = await prisma.subject.findMany({
      where: { class_id: classId, is_active: true, ...(subjectIds && { id: { in: subjectIds } }) },
    });

    const students = await prisma.student.findMany({
      where: { current_section_id: sectionId, deleted_at: null, status: "ACTIVE" },
      orderBy: { current_roll_no: "asc" },
    });

    const entries = await prisma.markEntry.findMany({
      where: { exam_id: examId, subject_id: { in: subjects.map((s) => s.id) }, student_id: { in: students.map((s) => s.id) } },
    });
    const byKey = new Map(entries.map((e) => [`${e.student_id}:${e.subject_id}`, e]));

    const configs = await prisma.examSubjectConfig.findMany({ where: { exam_id: examId, subject_id: { in: subjects.map((s) => s.id) } } });
    const configBySubject = new Map(configs.map((c) => [c.subject_id, c]));

    res.json({
      success: true,
      data: {
        entry_deadline_info: {
          closes_at: exam.mark_entry_closes_at,
          is_open: exam.status === "MARK_ENTRY",
          time_remaining: exam.mark_entry_closes_at ? Math.max(0, exam.mark_entry_closes_at.getTime() - Date.now()) : null,
        },
        subjects: subjects.map((s) => ({ ...s, config: configBySubject.get(s.id) })),
        students: students.map((s) => ({
          id: s.id,
          name_en: s.name_en,
          current_roll_no: s.current_roll_no,
          photo_url: s.photo_url,
          marks: Object.fromEntries(subjects.map((sub) => [sub.id, byKey.get(`${s.id}:${sub.id}`) ?? null])),
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
    if (exam.status !== "MARK_ENTRY") throw badRequest("Mark entry is not open for this exam");
    if (exam.mark_entry_closes_at && exam.mark_entry_closes_at < new Date()) throw badRequest("Mark entry window has closed");

    if (req.user!.role === "SUBJECT_TEACHER") {
      const subjectIds = [...new Set(body.entries.map((e) => e.subject_id))];
      const staff = await prisma.staff.findFirst({ where: { user_id: req.user!.sub } });
      const assignments = await prisma.subjectTeacherAssignment.findMany({ where: { staff_id: staff?.id, subject_id: { in: subjectIds } } });
      const assignedSubjectIds = new Set(assignments.map((a) => a.subject_id));
      if (subjectIds.some((id) => !assignedSubjectIds.has(id))) {
        throw forbidden("You can only submit marks for subjects assigned to you");
      }
    }

    const subjectIds = [...new Set(body.entries.map((e) => e.subject_id))];
    const configs = await prisma.examSubjectConfig.findMany({ where: { exam_id: body.exam_id, subject_id: { in: subjectIds } } });
    const configBySubject = new Map(configs.map((c) => [c.subject_id, c]));
    const scale = exam.grading_scale?.ranges ?? [];

    for (const entry of body.entries) {
      const config = configBySubject.get(entry.subject_id);
      const marksTotal = (entry.marks_theory ?? 0) + (entry.marks_practical ?? 0);
      if (config && marksTotal > config.full_marks_theory + config.full_marks_practical) {
        throw badRequest(`Marks for subject exceed full marks (${config.full_marks_theory + config.full_marks_practical})`);
      }

      const grade = calculateGrade(marksTotal, !!entry.is_absent, scale);

      await prisma.markEntry.upsert({
        where: { exam_id_student_id_subject_id: { exam_id: body.exam_id, student_id: entry.student_id, subject_id: entry.subject_id } },
        create: {
          exam_id: body.exam_id,
          student_id: entry.student_id,
          subject_id: entry.subject_id,
          marks_theory: entry.marks_theory,
          marks_practical: entry.marks_practical,
          marks_total: entry.is_absent ? null : marksTotal,
          is_absent: !!entry.is_absent,
          grade_letter: grade.grade_letter,
          grade_point: grade.grade_point,
          status: "SUBMITTED",
          entered_by_id: req.user!.sub,
        },
        update: {
          marks_theory: entry.marks_theory,
          marks_practical: entry.marks_practical,
          marks_total: entry.is_absent ? null : marksTotal,
          is_absent: !!entry.is_absent,
          grade_letter: grade.grade_letter,
          grade_point: grade.grade_point,
          status: "SUBMITTED",
          entered_by_id: req.user!.sub,
        },
      });
    }

    res.json({ success: true, message: `Submitted ${body.entries.length} mark entries` });
  }),
);

marksRouter.post(
  "/approve/:exam_id/:class_id",
  authorize(MARK_APPROVAL_ROLES),
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");

    const subjects = await prisma.subject.findMany({ where: { class_id: classId } });
    const students = await prisma.student.findMany({ where: { current_class_id: classId, deleted_at: null } });

    const entries = await prisma.markEntry.findMany({
      where: { exam_id: examId, subject_id: { in: subjects.map((s) => s.id) }, student_id: { in: students.map((s) => s.id) } },
    });

    const expectedCount = subjects.length * students.length;
    if (entries.length < expectedCount) {
      throw badRequest(`Not all marks submitted (${entries.length}/${expectedCount}). Cannot approve yet.`);
    }

    await prisma.markEntry.updateMany({
      where: { id: { in: entries.map((e) => e.id) } },
      data: { status: "APPROVED", approved_by_id: req.user!.sub, approved_at: new Date() },
    });

    res.json({ success: true, data: { approved: entries.length } });
  }),
);

marksRouter.post(
  "/publish/:exam_id/:class_id",
  authorize(RESULT_PUBLISH_ROLES),
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    const body = z.object({ is_public: z.boolean().optional() }).parse(req.body);

    const subjects = await prisma.subject.findMany({ where: { class_id: classId } });
    const unapproved = await prisma.markEntry.findFirst({
      where: { exam_id: examId, subject_id: { in: subjects.map((s) => s.id) }, status: { not: "APPROVED" } },
    });
    if (unapproved) throw badRequest("All marks must be approved before publishing");

    const publication = await prisma.resultPublication.upsert({
      where: { exam_id_class_id: { exam_id: examId, class_id: classId } },
      create: { exam_id: examId, class_id: classId, is_published: true, published_at: new Date(), published_by_id: req.user!.sub, is_public: body.is_public ?? false },
      update: { is_published: true, published_at: new Date(), published_by_id: req.user!.sub, is_public: body.is_public ?? false },
    });

    res.json({ success: true, data: publication });
  }),
);
