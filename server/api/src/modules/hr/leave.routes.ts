import { Router } from "express";
import { z } from "zod";
import type { UserRole } from "@education-erp/types";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { HR_MANAGE_ROLES, LEAVE_APPROVE_ROLES } from "../../lib/roles";
import { leaveTypeSchema, applyLeaveSchema, rejectLeaveSchema } from "@education-erp/validators";
import { resolveOwnStaffId } from "../../lib/own-staff";
import { badRequest, forbidden, notFound } from "../../lib/errors";

// GET / and POST /apply took a caller-supplied staff_id with no ownership
// check at all — any authenticated staff member could list every other
// staff member's leave history, or file a leave request under someone
// else's name. HR_MANAGE_ROLES (ADMIN/PRINCIPAL) may still act on any
// staff_id — that's the existing, legitimate "HR files leave on behalf of a
// staff member" flow from the admin Staff Detail page — everyone else is
// pinned to their own resolved staff row.

export const leaveTypesRouter = Router();
export const leavesRouter = Router();
leaveTypesRouter.use(authenticate);
leavesRouter.use(authenticate);

function workingDaysBetween(from: Date, to: Date): number {
  let count = 0;
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 5) count++; // exclude Friday — see working-days.ts note on no Holiday model
  }
  return count;
}

leaveTypesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const types = await prisma.leaveType.findMany({ orderBy: { name: "asc" } });
    res.json({ success: true, data: types });
  }),
);

leaveTypesRouter.post(
  "/",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = leaveTypeSchema.parse(req.body);
    const type = await prisma.leaveType.create({ data: body });
    res.status(201).json({ success: true, data: type });
  }),
);

leaveTypesRouter.put(
  "/:id",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = leaveTypeSchema.partial().parse(req.body);
    const type = await prisma.leaveType.update({ where: { id: reqParam(req, "id") }, data: body });
    res.json({ success: true, data: type });
  }),
);

leaveTypesRouter.delete(
  "/:id",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const inUse = await prisma.leaveRequest.findFirst({ where: { leave_type_id: id } });
    if (inUse) throw badRequest("Cannot delete a leave type that has leave requests");
    await prisma.leaveType.delete({ where: { id } });
    res.status(204).send();
  }),
);

leavesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z
      .object({ staff_id: z.string().optional(), status: z.string().optional(), from_date: z.string().optional(), to_date: z.string().optional(), leave_type_id: z.string().optional() })
      .parse(req.query);

    const isPrivileged = HR_MANAGE_ROLES.includes(req.user!.role as UserRole);
    const staffIdFilter = isPrivileged ? query.staff_id : await resolveOwnStaffId(req.user!.sub);

    const leaves = await prisma.leaveRequest.findMany({
      where: {
        ...(staffIdFilter && { staff_id: staffIdFilter }),
        ...(query.status && { status: query.status as never }),
        ...(query.leave_type_id && { leave_type_id: query.leave_type_id }),
        ...(query.from_date && { from_date: { gte: new Date(query.from_date) } }),
        ...(query.to_date && { to_date: { lte: new Date(query.to_date) } }),
      },
      include: { staff: { select: { name_en: true, staff_uid: true } }, leave_type: true },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: leaves });
  }),
);

leavesRouter.get(
  "/balance/:staff_id",
  asyncHandler(async (req, res) => {
    // "me" lets a self-service caller (e.g. the teacher app) fetch their own
    // balance without needing to already know their own Staff.id client-side.
    const rawStaffId = reqParam(req, "staff_id");
    const staffId = rawStaffId === "me" ? await resolveOwnStaffId(req.user!.sub) : rawStaffId;
    if (!HR_MANAGE_ROLES.includes(req.user!.role as UserRole) && staffId !== (await resolveOwnStaffId(req.user!.sub))) {
      throw forbidden("You can only view your own leave balance");
    }
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const yearEnd = new Date(new Date().getFullYear() + 1, 0, 1);

    const [types, approvedLeaves] = await Promise.all([
      prisma.leaveType.findMany(),
      prisma.leaveRequest.findMany({ where: { staff_id: staffId, status: "APPROVED", from_date: { gte: yearStart, lt: yearEnd } } }),
    ]);

    const balance = types.map((t) => {
      const used = approvedLeaves.filter((l) => l.leave_type_id === t.id).reduce((sum, l) => sum + workingDaysBetween(l.from_date, l.to_date), 0);
      return { leave_type: t, total_allowed: t.days_allowed, used, remaining: Math.max(0, t.days_allowed - used) };
    });

    res.json({ success: true, data: balance });
  }),
);

leavesRouter.post(
  "/apply",
  asyncHandler(async (req, res) => {
    const body = applyLeaveSchema.parse(req.body);
    if (!HR_MANAGE_ROLES.includes(req.user!.role as UserRole)) {
      body.staff_id = await resolveOwnStaffId(req.user!.sub);
    }
    if (body.to_date < body.from_date) throw badRequest("to_date must be on or after from_date");

    const leaveType = await prisma.leaveType.findUnique({ where: { id: body.leave_type_id } });
    if (!leaveType) throw notFound("Leave type not found");

    const requestedDays = workingDaysBetween(body.from_date, body.to_date);
    const yearStart = new Date(body.from_date.getFullYear(), 0, 1);
    const yearEnd = new Date(body.from_date.getFullYear() + 1, 0, 1);
    const approvedLeaves = await prisma.leaveRequest.findMany({
      where: { staff_id: body.staff_id, leave_type_id: body.leave_type_id, status: "APPROVED", from_date: { gte: yearStart, lt: yearEnd } },
    });
    const used = approvedLeaves.reduce((sum, l) => sum + workingDaysBetween(l.from_date, l.to_date), 0);
    if (used + requestedDays > leaveType.days_allowed) {
      throw badRequest(`Insufficient leave balance: ${leaveType.days_allowed - used} day(s) remaining for ${leaveType.name}`);
    }

    const leave = await prisma.leaveRequest.create({ data: body });
    res.status(201).json({ success: true, data: leave });
  }),
);

leavesRouter.put(
  "/:id/approve",
  authorize(LEAVE_APPROVE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const leave = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!leave) throw notFound("Leave request not found");
    if (leave.status !== "PENDING") throw badRequest("Only pending leave requests can be approved");

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.leaveRequest.update({ where: { id }, data: { status: "APPROVED", approved_by_id: req.user!.sub, approved_at: new Date() } });

      for (let d = new Date(leave.from_date); d <= leave.to_date; d.setDate(d.getDate() + 1)) {
        if (d.getDay() === 5) continue;
        const date = new Date(d);
        const existing = await tx.attendanceRecord.findFirst({ where: { person_id: leave.staff_id, person_type: "STAFF", date, shift_id: null, period_no: null } });
        if (existing) {
          await tx.attendanceRecord.update({ where: { id: existing.id }, data: { status: "LEAVE" } });
        } else {
          await tx.attendanceRecord.create({ data: { person_id: leave.staff_id, person_type: "STAFF", date, status: "LEAVE", marked_by_id: req.user!.sub } });
        }
      }

      return result;
    });

    res.json({ success: true, data: updated });
  }),
);

leavesRouter.put(
  "/:id/reject",
  authorize(LEAVE_APPROVE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = rejectLeaveSchema.parse(req.body);
    const leave = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!leave) throw notFound("Leave request not found");
    if (leave.status !== "PENDING") throw badRequest("Only pending leave requests can be rejected");

    const updated = await prisma.leaveRequest.update({ where: { id }, data: { status: "REJECTED", rejection_reason: body.reason } });
    res.json({ success: true, data: updated });
  }),
);
