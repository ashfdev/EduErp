import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { STUDENT_CRUD_ROLES, MARK_ENTRY_ROLES } from "../../lib/roles";
import { courseEnrollSchema, submitCourseGradeSchema } from "@education-erp/validators";
import { calculateGrade, calculateCGPA } from "../../utils/grading.engine";
import { badRequest, conflict, notFound, ApiError } from "../../lib/errors";
import { logAudit } from "../../lib/audit-log";

export const courseEnrollmentRouter = Router();
courseEnrollmentRouter.use(authenticate);

// Per-course grading reuses the existing GradingScale/GradeRange lookup
// unchanged — a Course doesn't carry its own scale; the institution's
// default GPA_4-type scale is used for every course grade, mirroring how
// school/college grading already picks one active scale.
async function getGpa4Scale() {
  const scale = await prisma.gradingScale.findFirst({
    where: { scale_type: "GPA_4" },
    include: { ranges: true },
    orderBy: { is_default: "desc" },
  });
  if (!scale) throw badRequest("No GPA_4 grading scale configured — create one under Settings → Grading before entering course grades");
  return scale;
}

courseEnrollmentRouter.get(
  "/",
  authorize(STUDENT_CRUD_ROLES),
  asyncHandler(async (req, res) => {
    const query = req.query as { student_id?: string; class_id?: string; course_id?: string };
    const enrollments = await prisma.courseEnrollment.findMany({
      where: {
        ...(query.student_id && { student_id: query.student_id }),
        ...(query.class_id && { class_id: query.class_id }),
        ...(query.course_id && { course_id: query.course_id }),
      },
      include: { course: { select: { code: true, name_en: true, credit_hours: true, semester_number: true } }, student: { select: { name_en: true, student_uid: true } } },
      orderBy: { enrolled_at: "desc" },
    });
    res.json({ success: true, data: enrollments });
  }),
);

courseEnrollmentRouter.get(
  "/student/:student_id/cgpa",
  authorize(STUDENT_CRUD_ROLES),
  asyncHandler(async (req, res) => {
    const studentId = reqParam(req, "student_id");
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { cgpa: true, current_semester: true } });
    if (!student) throw notFound("Student not found");

    const history = await prisma.courseEnrollment.findMany({
      where: { student_id: studentId, status: { in: ["COMPLETED", "FAILED"] } },
      include: { course: { select: { code: true, name_en: true, credit_hours: true, semester_number: true } }, class: { select: { id: true, name_en: true } } },
      orderBy: [{ course: { semester_number: "asc" } }],
    });

    // Per-semester SGPA breakdown — a Class row IS one semester's offering
    // (Phase 25's design), so grouping graded history by class_id and
    // applying calculateCGPA's exact credit-weighted formula to each group
    // is mathematically SGPA; calculateSGPA() isn't reused here since it's
    // shaped for re-grading raw marks against a scale, not aggregating
    // already-finalized grade_point values like this.
    const bySemester = new Map<string, { class_name: string; semester_number: number; entries: { grade_point: number; credit_hours: number }[] }>();
    for (const h of history) {
      const key = h.class_id;
      if (!bySemester.has(key)) bySemester.set(key, { class_name: h.class.name_en, semester_number: h.course.semester_number, entries: [] });
      bySemester.get(key)!.entries.push({ grade_point: h.grade_point ?? 0, credit_hours: h.course.credit_hours });
    }
    const semesters = [...bySemester.entries()]
      .map(([class_id, s]) => ({
        class_id,
        class_name: s.class_name,
        semester_number: s.semester_number,
        sgpa: calculateCGPA(s.entries),
        credit_hours: s.entries.reduce((sum, e) => sum + e.credit_hours, 0),
      }))
      .sort((a, b) => a.semester_number - b.semester_number);

    res.json({ success: true, data: { cgpa: student.cgpa, current_semester: student.current_semester, courses: history, semesters } });
  }),
);

courseEnrollmentRouter.post(
  "/",
  authorize(STUDENT_CRUD_ROLES),
  asyncHandler(async (req, res) => {
    const body = courseEnrollSchema.parse(req.body);

    // Structural cross-program guard — the real fix, not just a UI-level
    // narrowing. A student can only enroll in a course belonging to their
    // OWN current program, enforced here regardless of what the client sent.
    const [student, course] = await Promise.all([
      prisma.student.findUnique({ where: { id: body.student_id }, select: { current_class: { select: { program_id: true } } } }),
      prisma.course.findUnique({ where: { id: body.course_id }, select: { program_id: true, credit_hours: true } }),
    ]);
    if (!student) throw notFound("Student not found");
    if (!course) throw notFound("Course not found");
    if (!student.current_class?.program_id || student.current_class.program_id !== course.program_id) {
      throw badRequest("This course does not belong to the student's own program.");
    }

    const prerequisites = await prisma.prerequisite.findMany({
      where: { course_id: body.course_id },
      include: { prerequisite_course: { select: { code: true, name_en: true } } },
    });
    if (prerequisites.length > 0) {
      const completed = await prisma.courseEnrollment.findMany({
        where: { student_id: body.student_id, course_id: { in: prerequisites.map((p) => p.prerequisite_course_id) }, status: "COMPLETED" },
        select: { course_id: true },
      });
      const completedIds = new Set(completed.map((c) => c.course_id));
      const missing = prerequisites.filter((p) => !completedIds.has(p.prerequisite_course_id));
      if (missing.length > 0) {
        throw badRequest(`Missing prerequisite(s): ${missing.map((m) => `${m.prerequisite_course.code} - ${m.prerequisite_course.name_en}`).join(", ")}`);
      }
    }

    const existing = await prisma.courseEnrollment.findUnique({
      where: { student_id_course_id_class_id: { student_id: body.student_id, course_id: body.course_id, class_id: body.class_id } },
    });
    if (existing) throw conflict("This student is already enrolled in this course for this semester");

    // Credit-hour cap — soft warning with an explicit override, mirroring
    // Section.capacity's exact UX (Phase 62), not a hard block. Unset cap =
    // no-op, same "opt-in constraint" convention as every other Settings-
    // driven soft limit in this codebase.
    if (!body.override) {
      const program = await prisma.program.findUnique({ where: { id: course.program_id }, select: { max_credit_hours_per_semester: true } });
      if (program?.max_credit_hours_per_semester) {
        const inProgress = await prisma.courseEnrollment.findMany({
          where: { student_id: body.student_id, class_id: body.class_id, status: "ENROLLED" },
          include: { course: { select: { credit_hours: true } } },
        });
        const currentLoad = inProgress.reduce((sum, e) => sum + e.course.credit_hours, 0);
        const projected = currentLoad + course.credit_hours;
        if (projected > program.max_credit_hours_per_semester) {
          throw new ApiError(
            400,
            "CREDIT_CAP_EXCEEDED",
            `This exceeds the program's credit cap for this semester (${projected}/${program.max_credit_hours_per_semester}). Continue anyway?`,
          );
        }
      }
    }

    const { override: _override, ...enrollmentData } = body;
    const enrollment = await prisma.courseEnrollment.create({ data: { ...enrollmentData, entered_by_id: req.user!.sub } });
    await logAudit("COURSE_ENROLL", { userId: req.user!.sub, targetType: "CourseEnrollment", targetId: enrollment.id, metadata: { student_id: body.student_id, course_id: body.course_id }, req });
    res.status(201).json({ success: true, data: enrollment });
  }),
);

courseEnrollmentRouter.put(
  "/:id",
  authorize(MARK_ENTRY_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.courseEnrollment.findUnique({ where: { id }, include: { course: true } });
    if (!existing) throw notFound("Enrollment not found");

    const body = submitCourseGradeSchema.parse(req.body);
    const finalizing = body.status === "COMPLETED" || body.status === "FAILED";
    const effectiveMarks = body.marks_total !== undefined ? body.marks_total : existing.marks_total;

    let grade_letter = existing.grade_letter;
    let grade_point = existing.grade_point;
    if (body.marks_total !== undefined || finalizing) {
      const scale = await getGpa4Scale();
      const graded = calculateGrade(effectiveMarks ?? 0, false, scale.ranges);
      grade_letter = graded.grade_letter;
      grade_point = graded.grade_point;
    }

    const updated = await prisma.courseEnrollment.update({
      where: { id },
      data: {
        ...(body.marks_total !== undefined && { marks_total: body.marks_total }),
        ...(body.status !== undefined && { status: body.status }),
        grade_letter,
        grade_point,
        entered_by_id: req.user!.sub,
      },
    });

    if (finalizing) {
      const history = await prisma.courseEnrollment.findMany({
        where: { student_id: existing.student_id, status: { in: ["COMPLETED", "FAILED"] } },
        include: { course: { select: { credit_hours: true } } },
      });
      const cgpa = calculateCGPA(history.map((h) => ({ grade_point: h.grade_point ?? 0, credit_hours: h.course.credit_hours })));
      await prisma.student.update({ where: { id: existing.student_id }, data: { cgpa } });
    }

    await logAudit("COURSE_GRADE_ENTRY", { userId: req.user!.sub, targetType: "CourseEnrollment", targetId: id, metadata: { status: body.status, marks_total: body.marks_total }, req });
    res.json({ success: true, data: updated });
  }),
);
