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
import { logAudit } from "../../lib/audit-log";
import { badRequest, forbidden, notFound } from "../../lib/errors";

export const marksRouter = Router();
marksRouter.use(authenticate);

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

    if (req.user!.role === "CLASS_TEACHER") {
      const section = await prisma.section.findUnique({ where: { id: sectionId } });
      const staff = await prisma.staff.findFirst({ where: { user_id: req.user!.sub } });
      if (!section || section.class_teacher_id !== staff?.id) {
        throw forbidden("You are not the class teacher for this section");
      }
    }

    let subjectIds: string[] | undefined;
    if (query.subject_id) {
      subjectIds = [query.subject_id];
    } else if (req.user!.role === "SUBJECT_TEACHER") {
      const assignments = await prisma.subjectTeacherAssignment.findMany({
        where: { staff: { user_id: req.user!.sub }, OR: [{ section_id: sectionId }, { section_id: null }] },
      });
      subjectIds = assignments.map((a) => a.subject_id);
    }

    const rawSubjects = await prisma.subject.findMany({
      where: { class_id: classId, is_active: true, ...(subjectIds && { id: { in: subjectIds } }) },
    });
    // Defensive: two active subject rows can share a display name (only
    // (class_id, code) is unique), which would otherwise render as two
    // visually-identical columns in the grid below.
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

    const configs = await prisma.examSubjectConfig.findMany({ where: { exam_id: examId, subject_id: { in: subjects.map((s) => s.id) } } });
    const configBySubject = new Map(configs.map((c) => [c.subject_id, c]));

    const componentConfigs = await prisma.markComponentConfig.findMany({
      where: { exam_id: examId, subject_id: { in: subjects.map((s) => s.id) } },
      orderBy: { display_order: "asc" },
    });
    const componentsBySubject = new Map<string, typeof componentConfigs>();
    for (const c of componentConfigs) {
      componentsBySubject.set(c.subject_id, [...(componentsBySubject.get(c.subject_id) ?? []), c]);
    }

    res.json({
      success: true,
      data: {
        entry_deadline_info: {
          closes_at: exam.mark_entry_closes_at,
          is_open: exam.status === "MARK_ENTRY",
          time_remaining: exam.mark_entry_closes_at ? Math.max(0, exam.mark_entry_closes_at.getTime() - Date.now()) : null,
        },
        subjects: subjects.map((s) => ({ ...s, config: configBySubject.get(s.id), components: componentsBySubject.get(s.id) ?? [] })),
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

    const componentConfigs = await prisma.markComponentConfig.findMany({ where: { exam_id: body.exam_id, subject_id: { in: subjectIds } } });
    const componentsBySubject = new Map<string, typeof componentConfigs>();
    for (const c of componentConfigs) {
      componentsBySubject.set(c.subject_id, [...(componentsBySubject.get(c.subject_id) ?? []), c]);
    }

    for (const entry of body.entries) {
      const config = configBySubject.get(entry.subject_id);
      const components = componentsBySubject.get(entry.subject_id);

      // When a subject has configured components, the theory mark is always
      // the server-computed sum of those components — never trust a
      // client-submitted marks_theory that could silently disagree with it.
      let marksTheory = entry.marks_theory ?? null;
      let componentMarks: Record<string, number> | null = null;
      if (components && components.length > 0 && !entry.is_absent) {
        const provided = entry.component_marks ?? {};
        const configByKey = new Map(components.map((c) => [c.key, c]));
        for (const [k, v] of Object.entries(provided)) {
          const conf = configByKey.get(k);
          if (!conf) throw badRequest(`Unknown mark component "${k}" for subject`);
          if (v < 0 || v > conf.max_marks) throw badRequest(`${conf.label} must be between 0 and ${conf.max_marks}`);
        }
        componentMarks = provided;
        marksTheory = Object.values(provided).reduce((sum, v) => sum + v, 0);
      }

      const marksTotal = (marksTheory ?? 0) + (entry.marks_practical ?? 0);
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
          marks_theory: marksTheory,
          marks_practical: entry.marks_practical,
          component_marks: componentMarks ?? undefined,
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
          component_marks: componentMarks ?? Prisma.DbNull,
          marks_total: entry.is_absent ? null : marksTotal,
          is_absent: !!entry.is_absent,
          grade_letter: grade.grade_letter,
          grade_point: grade.grade_point,
          status: "SUBMITTED",
          entered_by_id: req.user!.sub,
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
    await logAudit("RESULT_APPROVE", { userId: req.user!.sub, targetType: "Exam", targetId: examId, metadata: { approved: entries.length }, req });

    res.json({ success: true, data: { approved: entries.length } });
  }),
);

marksRouter.get(
  "/publish-status/:exam_id",
  authorize(RESULT_PUBLISH_ROLES),
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const publications = await prisma.resultPublication.findMany({ where: { exam_id: examId } });
    res.json({
      success: true,
      data: publications.map((p) => ({ class_id: p.class_id, is_published: p.is_published, is_public: p.is_public, published_at: p.published_at })),
    });
  }),
);

marksRouter.post(
  "/publish/:exam_id/:class_id",
  authorize(RESULT_PUBLISH_ROLES),
  asyncHandler(async (req, res) => {
    const examId = reqParam(req, "exam_id");
    const classId = reqParam(req, "class_id");
    const body = z.object({ is_public: z.boolean().optional() }).parse(req.body);
    // "Public on website" defaults ON — staff can already see the result
    // regardless of this flag, so the more common mistake is publishing and
    // assuming the public site updated too, not accidentally exposing it.
    const isPublic = body.is_public ?? true;

    const subjects = await prisma.subject.findMany({ where: { class_id: classId } });
    const unapproved = await prisma.markEntry.findFirst({
      where: { exam_id: examId, subject_id: { in: subjects.map((s) => s.id) }, status: { not: "APPROVED" } },
    });
    if (unapproved) throw badRequest("All marks must be approved before publishing");

    const publication = await prisma.resultPublication.upsert({
      where: { exam_id_class_id: { exam_id: examId, class_id: classId } },
      create: { exam_id: examId, class_id: classId, is_published: true, published_at: new Date(), published_by_id: req.user!.sub, is_public: isPublic },
      update: { is_published: true, published_at: new Date(), published_by_id: req.user!.sub, is_public: isPublic },
    });
    await logAudit("RESULT_PUBLISH", { userId: req.user!.sub, targetType: "ResultPublication", targetId: publication.id, metadata: { exam_id: examId, class_id: classId, is_public: isPublic }, req });

    // An exam can span multiple classes (via ExamSubjectConfig) — only flip
    // Exam.status to PUBLISHED once every one of those classes has actually
    // been published, so it isn't misleadingly marked done after just one.
    const examClassIds = await prisma.subject
      .findMany({ where: { exam_subject_configs: { some: { exam_id: examId } } }, select: { class_id: true }, distinct: ["class_id"] })
      .then((rows) => [...new Set(rows.map((r) => r.class_id))]);
    const publishedClassIds = await prisma.resultPublication
      .findMany({ where: { exam_id: examId, is_published: true, class_id: { in: examClassIds } }, select: { class_id: true } })
      .then((rows) => new Set(rows.map((r) => r.class_id)));
    if (examClassIds.length > 0 && examClassIds.every((id) => publishedClassIds.has(id))) {
      await prisma.exam.update({ where: { id: examId }, data: { status: "PUBLISHED" } });
    }

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    const perStudent = await computeClassResults(examId, classId);
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
    }

    res.json({ success: true, data: publication });
  }),
);
