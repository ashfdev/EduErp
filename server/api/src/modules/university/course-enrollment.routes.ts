import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { STUDENT_CRUD_ROLES, MARK_ENTRY_ROLES } from "../../lib/roles";
import { courseEnrollSchema, submitCourseGradeSchema } from "@education-erp/validators";
import { calculateGrade, calculateCGPA } from "../../utils/grading.engine";
import { badRequest, conflict, notFound } from "../../lib/errors";
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
  asyncHandler(async (req, res) => {
    const studentId = reqParam(req, "student_id");
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { cgpa: true, current_semester: true } });
    if (!student) throw notFound("Student not found");

    const history = await prisma.courseEnrollment.findMany({
      where: { student_id: studentId, status: { in: ["COMPLETED", "FAILED"] } },
      include: { course: { select: { code: true, name_en: true, credit_hours: true, semester_number: true } } },
      orderBy: [{ course: { semester_number: "asc" } }],
    });

    res.json({ success: true, data: { cgpa: student.cgpa, current_semester: student.current_semester, courses: history } });
  }),
);

courseEnrollmentRouter.post(
  "/",
  authorize(STUDENT_CRUD_ROLES),
  asyncHandler(async (req, res) => {
    const body = courseEnrollSchema.parse(req.body);

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

    const enrollment = await prisma.courseEnrollment.create({ data: { ...body, entered_by_id: req.user!.sub } });
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
