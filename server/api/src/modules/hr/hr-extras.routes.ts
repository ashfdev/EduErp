import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { PAYROLL_MANAGE_ROLES, HR_MANAGE_ROLES } from "../../lib/roles";
import { badRequest, notFound } from "../../lib/errors";

// ─────────────────────────────────────────────────────────────────
// TAX DEDUCTION ROUTER  — /hr/tax-deductions
// ─────────────────────────────────────────────────────────────────
// TaxDeduction rows are auto-created by the payroll /finalize route
// whenever tds_amount > 0.  This router provides read-only history
// and a manual correction path for the accountant.
export const taxDeductionRouter = Router();
taxDeductionRouter.use(authenticate);

// GET /hr/tax-deductions?staff_id=&year=
taxDeductionRouter.get(
  "/",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ staff_id: z.string().optional(), year: z.coerce.number().int().optional() }).parse(req.query);
    const records = await prisma.taxDeduction.findMany({
      where: {
        ...(query.staff_id && { staff_id: query.staff_id }),
        ...(query.year && { payroll_record: { year: query.year } }),
      },
      include: {
        staff: { select: { id: true, name_en: true, staff_uid: true } },
        payroll_record: { select: { month: true, year: true } },
      },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: records });
  }),
);

// ─────────────────────────────────────────────────────────────────
// SALARY INCREMENT ROUTER  — /hr/increments
// ─────────────────────────────────────────────────────────────────
export const salaryIncrementRouter = Router();
salaryIncrementRouter.use(authenticate);

const createIncrementSchema = z.object({
  staff_id: z.string().min(1),
  increment_amount: z.number().positive("Increment must be positive"),
  new_gross_salary: z.number().positive(),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "effective_date must be YYYY-MM-DD"),
  reason: z.string().optional(),
});

// POST /hr/increments — log a salary increment and update the staff's salary structure.
salaryIncrementRouter.post(
  "/",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = createIncrementSchema.parse(req.body);

    const staff = await prisma.staff.findFirst({
      where: { id: body.staff_id, deleted_at: null },
      include: { salary_structure: true },
    });
    if (!staff) throw notFound("Staff not found");
    if (!staff.salary_structure) throw badRequest("This staff has no salary structure assigned. Assign a salary structure first.");

    // Snapshot the increment into history, then update the structure's basic.
    // Updating basic (the largest component) is the conventional way salaries
    // are adjusted — the full gross is re-derived at /calculate time
    // (basic + house_rent + medical + transport), so changing basic alone
    // is sufficient to reflect the new gross in the next payroll run.
    const increment = await prisma.$transaction(async (tx) => {
      const record = await tx.salaryIncrement.create({
        data: {
          staff_id: body.staff_id,
          increment_amount: body.increment_amount,
          new_gross_salary: body.new_gross_salary,
          effective_date: new Date(body.effective_date),
          reason: body.reason ?? null,
        },
      });

      // Adjust the structure's basic by the increment amount.
      await tx.salaryStructure.update({
        where: { id: staff.salary_structure_id! },
        data: { basic: { increment: body.increment_amount } },
      });

      return record;
    });

    res.status(201).json({ success: true, data: increment });
  }),
);

// GET /hr/increments?staff_id=
salaryIncrementRouter.get(
  "/",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ staff_id: z.string().optional() }).parse(req.query);
    const records = await prisma.salaryIncrement.findMany({
      where: { ...(query.staff_id && { staff_id: query.staff_id }) },
      include: { staff: { select: { id: true, name_en: true, staff_uid: true } } },
      orderBy: { effective_date: "desc" },
    });
    res.json({ success: true, data: records });
  }),
);

// ─────────────────────────────────────────────────────────────────
// LEAVE ENCASHMENT ROUTER  — /hr/leave-encashments
// ─────────────────────────────────────────────────────────────────
export const leaveEncashmentRouter = Router();
leaveEncashmentRouter.use(authenticate);

const encashLeaveSchema = z.object({
  staff_id: z.string().min(1),
  year: z.number().int().min(2000),
  date_paid: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date_paid must be YYYY-MM-DD"),
  // The caller passes the number of unused leaves; we calculate the payout
  // from the staff's per-day basic salary (basic / working_days_per_month).
  unused_leaves: z.number().int().positive(),
  // Optional override if the institution uses a different encashment rate.
  override_per_day_rate: z.number().positive().optional(),
});

// POST /hr/leave-encashments — process an encashment payout.
leaveEncashmentRouter.post(
  "/",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = encashLeaveSchema.parse(req.body);

    // Prevent duplicate encashment for the same staff+year.
    const existing = await prisma.leaveEncashment.findFirst({ where: { staff_id: body.staff_id, year: body.year } });
    if (existing) throw badRequest(`Leave encashment for ${body.year} already processed for this staff member.`);

    const staff = await prisma.staff.findFirst({
      where: { id: body.staff_id, deleted_at: null },
      include: { salary_structure: true },
    });
    if (!staff) throw notFound("Staff not found");
    if (!staff.salary_structure) throw badRequest("No salary structure assigned — cannot compute per-day rate.");

    // Per-day rate: basic / 26 (standard BD convention for leave encashment).
    // Caller may supply override_per_day_rate to use a different rate.
    const perDayRate = body.override_per_day_rate ?? staff.salary_structure.basic / 26;
    const encashedAmount = Math.round(perDayRate * body.unused_leaves * 100) / 100;

    const record = await prisma.leaveEncashment.create({
      data: {
        staff_id: body.staff_id,
        year: body.year,
        unused_leaves: body.unused_leaves,
        encashed_amount: encashedAmount,
        date_paid: new Date(body.date_paid),
      },
    });

    res.status(201).json({ success: true, data: { ...record, per_day_rate_used: perDayRate } });
  }),
);

// GET /hr/leave-encashments?staff_id=&year=
leaveEncashmentRouter.get(
  "/",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ staff_id: z.string().optional(), year: z.coerce.number().int().optional() }).parse(req.query);
    const records = await prisma.leaveEncashment.findMany({
      where: {
        ...(query.staff_id && { staff_id: query.staff_id }),
        ...(query.year && { year: query.year }),
      },
      include: { staff: { select: { id: true, name_en: true, staff_uid: true } } },
      orderBy: { date_paid: "desc" },
    });
    res.json({ success: true, data: records });
  }),
);

// DELETE /hr/leave-encashments/:id — remove an incorrectly entered record.
leaveEncashmentRouter.delete(
  "/:id",
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.leaveEncashment.findUnique({ where: { id } });
    if (!existing) throw notFound("Leave encashment record not found");
    await prisma.leaveEncashment.delete({ where: { id } });
    res.json({ success: true, data: { id } });
  }),
);
