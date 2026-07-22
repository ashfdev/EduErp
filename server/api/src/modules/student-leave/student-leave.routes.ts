import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { STAFF_ONLY_ROLES } from "../../lib/roles";
import { rejectStudentLeaveSchema } from "@education-erp/validators";
import { resolveOwnStaffId } from "../../lib/own-staff";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { createInAppNotification } from "../../services/in-app-notification.service";
import { writeDailyLeaveForStudent, writeSubjectLeaveForTeacher, revertSubjectLeave } from "../../lib/student-leave-approvers";

// Student Leave Request, staff-facing side (Plan Thirteen, Phase J).
// Portal-facing submit/own-history routes live in portal.routes.ts instead
// (matching every other "own student data" route's home), reusing
// assertAccess the same way they all do.
//
// Which approval path a given request follows is never re-derived from the
// CURRENT AttendanceRules.leave_approval_mode setting — it's decided once,
// implicitly, by whether the request has any StudentLeaveApproval child
// rows (Mode B always creates at least one at submission time; Mode A
// creates none). This is deliberately more robust than branching on the
// live setting on every approve/reject call: if an admin changes the mode
// after a request is already in flight, that request keeps following
// whichever path it was actually submitted under, rather than silently
// reinterpreting an already-pending request under a rule that didn't exist
// when it was filed.

export const studentLeaveRouter = Router();
studentLeaveRouter.use(authenticate, authorize(STAFF_ONLY_ROLES));

async function isAdmin(role: string) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

studentLeaveRouter.get(
  "/pending",
  asyncHandler(async (req, res) => {
    const admin = await isAdmin(req.user!.role);
    const staffId = admin ? undefined : await resolveOwnStaffId(req.user!.sub);

    const [classTeacherPending, subjectTeacherPending] = await Promise.all([
      prisma.studentLeaveRequest.findMany({
        where: {
          status: "PENDING",
          approvals: { none: {} },
          ...(!admin && { student: { current_section: { class_teacher_id: staffId } } }),
        },
        include: { student: { select: { id: true, name_en: true, student_uid: true, current_section: { select: { name: true } } } } },
        orderBy: { created_at: "desc" },
      }),
      prisma.studentLeaveApproval.findMany({
        where: {
          status: "PENDING",
          leave_request: { status: { in: ["PENDING", "PARTIALLY_APPROVED"] } },
          ...(!admin && { teacher_id: staffId }),
        },
        include: {
          leave_request: { include: { student: { select: { id: true, name_en: true, student_uid: true } } } },
          teacher: { select: { name_en: true } },
        },
        orderBy: { leave_request: { created_at: "desc" } },
      }),
    ]);

    res.json({ success: true, data: { class_teacher_pending: classTeacherPending, subject_teacher_pending: subjectTeacherPending } });
  }),
);

studentLeaveRouter.get(
  "/requests",
  asyncHandler(async (req, res) => {
    const query = z.object({ status: z.string().optional() }).parse(req.query);
    const requests = await prisma.studentLeaveRequest.findMany({
      where: { ...(query.status && { status: query.status as never }) },
      include: {
        student: { select: { id: true, name_en: true, student_uid: true, current_class: { select: { name_en: true } }, current_section: { select: { name: true } } } },
        approvals: { include: { teacher: { select: { name_en: true } } } },
      },
      orderBy: { created_at: "desc" },
      take: 200,
    });
    res.json({ success: true, data: requests });
  }),
);

studentLeaveRouter.put(
  "/requests/:id/approve",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const admin = await isAdmin(req.user!.role);
    const leave = await prisma.studentLeaveRequest.findUnique({
      where: { id },
      include: { student: { select: { current_section: { select: { class_teacher_id: true } } } }, approvals: true },
    });
    if (!leave) throw notFound("Leave request not found");
    if (leave.approvals.length) throw badRequest("This request requires subject-teacher approval, not class-teacher approval");
    if (leave.status !== "PENDING") throw badRequest("Only a pending leave request can be approved");

    if (!admin) {
      const staffId = await resolveOwnStaffId(req.user!.sub);
      if (leave.student.current_section?.class_teacher_id !== staffId) throw forbidden("You are not the class teacher for this student's section");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.studentLeaveRequest.update({ where: { id }, data: { status: "APPROVED", decided_at: new Date() } });
      await writeDailyLeaveForStudent(tx, leave.student_id, leave.from_date, leave.to_date, req.user!.sub);
      return result;
    });

    await createInAppNotification({ userId: leave.requested_by_user_id, type: "LEAVE_APPROVED", title: "Leave request approved", link: "/leave-requests" });
    res.json({ success: true, data: updated });
  }),
);

studentLeaveRouter.put(
  "/requests/:id/reject",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = rejectStudentLeaveSchema.parse(req.body);
    const admin = await isAdmin(req.user!.role);
    const leave = await prisma.studentLeaveRequest.findUnique({
      where: { id },
      include: { student: { select: { current_section: { select: { class_teacher_id: true } } } }, approvals: true },
    });
    if (!leave) throw notFound("Leave request not found");
    if (leave.approvals.length) throw badRequest("This request requires subject-teacher approval, not class-teacher rejection");
    if (leave.status !== "PENDING") throw badRequest("Only a pending leave request can be rejected");

    if (!admin) {
      const staffId = await resolveOwnStaffId(req.user!.sub);
      if (leave.student.current_section?.class_teacher_id !== staffId) throw forbidden("You are not the class teacher for this student's section");
    }

    const updated = await prisma.studentLeaveRequest.update({
      where: { id },
      data: { status: "REJECTED", rejection_reason: body.reason, decided_at: new Date() },
    });
    await createInAppNotification({ userId: leave.requested_by_user_id, type: "LEAVE_REJECTED", title: "Leave request rejected", body: body.reason, link: "/leave-requests" });
    res.json({ success: true, data: updated });
  }),
);

studentLeaveRouter.put(
  "/approvals/:id/approve",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const admin = await isAdmin(req.user!.role);
    const approval = await prisma.studentLeaveApproval.findUnique({ where: { id }, include: { leave_request: true } });
    if (!approval) throw notFound("Approval record not found");
    if (!admin) {
      const staffId = await resolveOwnStaffId(req.user!.sub);
      if (approval.teacher_id !== staffId) throw forbidden("This approval is not assigned to you");
    }
    if (approval.status !== "PENDING") throw badRequest("This approval has already been decided");
    if (approval.leave_request.status === "REJECTED") throw badRequest("This leave request has already been rejected");

    const updated = await prisma.$transaction(async (tx) => {
      await tx.studentLeaveApproval.update({ where: { id }, data: { status: "APPROVED", decided_at: new Date() } });
      await writeSubjectLeaveForTeacher(tx, approval.leave_request.student_id, approval.teacher_id, approval.leave_request.from_date, approval.leave_request.to_date);

      const allApprovals = await tx.studentLeaveApproval.findMany({ where: { leave_request_id: approval.leave_request_id } });
      const allApproved = allApprovals.every((a) => a.id === id || a.status === "APPROVED");
      const newStatus = allApproved ? "APPROVED" : "PARTIALLY_APPROVED";
      return tx.studentLeaveRequest.update({ where: { id: approval.leave_request_id }, data: { status: newStatus, ...(allApproved && { decided_at: new Date() }) } });
    });

    if (updated.status === "APPROVED") {
      await createInAppNotification({ userId: approval.leave_request.requested_by_user_id, type: "LEAVE_APPROVED", title: "Leave request fully approved", link: "/leave-requests" });
    }
    res.json({ success: true, data: updated });
  }),
);

studentLeaveRouter.put(
  "/approvals/:id/reject",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = rejectStudentLeaveSchema.parse(req.body);
    const admin = await isAdmin(req.user!.role);
    const approval = await prisma.studentLeaveApproval.findUnique({ where: { id }, include: { leave_request: true } });
    if (!approval) throw notFound("Approval record not found");
    if (!admin) {
      const staffId = await resolveOwnStaffId(req.user!.sub);
      if (approval.teacher_id !== staffId) throw forbidden("This approval is not assigned to you");
    }
    if (approval.status !== "PENDING") throw badRequest("This approval has already been decided");
    if (approval.leave_request.status === "REJECTED") throw badRequest("This leave request has already been rejected");

    const updated = await prisma.$transaction(async (tx) => {
      await tx.studentLeaveApproval.update({ where: { id }, data: { status: "REJECTED", decided_at: new Date(), rejection_reason: body.reason } });
      // A single rejection immediately rejects the whole request — undo any
      // SubjectAttendance LEAVE rows other, earlier-approving teachers may
      // already have written for this student/date-range.
      await revertSubjectLeave(tx, approval.leave_request.student_id, approval.leave_request.from_date, approval.leave_request.to_date);
      return tx.studentLeaveRequest.update({
        where: { id: approval.leave_request_id },
        data: { status: "REJECTED", rejection_reason: body.reason, decided_at: new Date() },
      });
    });

    await createInAppNotification({ userId: approval.leave_request.requested_by_user_id, type: "LEAVE_REJECTED", title: "Leave request rejected", body: body.reason, link: "/leave-requests" });
    res.json({ success: true, data: updated });
  }),
);
