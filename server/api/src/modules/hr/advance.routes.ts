import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { PAYROLL_MANAGE_ROLES } from "../../lib/roles";
import { badRequest, notFound } from "../../lib/errors";

export const advanceRouter = Router();
advanceRouter.use(authenticate);

const createAdvanceSchema = z.object({
  staff_id: z.string().min(1),
  amount: z.number().positive("Advance amount must be positive"),
  monthly_emi: z.number().positive().optional(),
  reason: z.string().optional(),
  date_given: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date_given must be YYYY-MM-DD"),
});

const updateAdvanceSchema = z.object({
  monthly_emi: z.number().positive().optional(),
  reason: z.string().optional(),
  status: z.enum(["PENDING", "PARTIAL", "CLEARED"]).optional(),
});

// POST /hr/advances
// Register a new advance loan given to a staff member.
advanceRouter.post(
  "/",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = createAdvanceSchema.parse(req.body);

    const staff = await prisma.staff.findFirst({ where: { id: body.staff_id, deleted_at: null } });
    if (!staff) throw notFound("Staff not found");

    // Guard against creating a new advance while the previous one is still uncleared.
    // An EMI-based recovery plan requires exactly one open advance at a time to be
    // meaningful — stacking two advances makes the monthly deduction amount ambiguous
    // unless each is tracked independently, which the current single-EMI model
    // doesn't support.  If the caller genuinely wants a second advance, they should
    // PATCH the existing PARTIAL to CLEARED first (or adjust its amount_cleared).
    const existingOpen = await prisma.staffAdvance.findFirst({
      where: { staff_id: body.staff_id, status: { in: ["PENDING", "PARTIAL"] } },
    });
    if (existingOpen) {
      throw badRequest(
        `This staff already has an uncleared advance of ৳${existingOpen.amount} (status: ${existingOpen.status}). ` +
          `Clear or settle the existing advance before issuing a new one.`,
      );
    }

    const advance = await prisma.staffAdvance.create({
      data: {
        staff_id: body.staff_id,
        amount: body.amount,
        amount_cleared: 0,
        monthly_emi: body.monthly_emi ?? null,
        reason: body.reason ?? null,
        date_given: new Date(body.date_given),
        status: "PENDING",
      },
    });

    res.status(201).json({ success: true, data: advance });
  }),
);

// GET /hr/advances
// List advances with optional filters: staff_id, status.
advanceRouter.get(
  "/",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        staff_id: z.string().optional(),
        status: z.enum(["PENDING", "PARTIAL", "CLEARED"]).optional(),
      })
      .parse(req.query);

    const advances = await prisma.staffAdvance.findMany({
      where: {
        ...(query.staff_id && { staff_id: query.staff_id }),
        ...(query.status && { status: query.status }),
      },
      include: {
        staff: { select: { id: true, name_en: true, staff_uid: true, department: { select: { name_en: true } } } },
      },
      orderBy: { date_given: "desc" },
    });

    res.json({ success: true, data: advances });
  }),
);

// GET /hr/advances/:id
advanceRouter.get(
  "/:id",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const advance = await prisma.staffAdvance.findUnique({
      where: { id },
      include: { staff: { select: { id: true, name_en: true, staff_uid: true } } },
    });
    if (!advance) throw notFound("Staff advance not found");
    res.json({ success: true, data: advance });
  }),
);

// PATCH /hr/advances/:id
// Update EMI, reason, or manually flip status (e.g., to CLEARED after an
// out-of-payroll settlement).  amount and amount_cleared are intentionally
// NOT patchable here — they are updated atomically by the payroll finalize
// route to prevent manual drift.
advanceRouter.patch(
  "/:id",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = updateAdvanceSchema.parse(req.body);

    const existing = await prisma.staffAdvance.findUnique({ where: { id } });
    if (!existing) throw notFound("Staff advance not found");

    const updated = await prisma.staffAdvance.update({
      where: { id },
      data: {
        ...(body.monthly_emi !== undefined && { monthly_emi: body.monthly_emi }),
        ...(body.reason !== undefined && { reason: body.reason }),
        ...(body.status !== undefined && { status: body.status }),
      },
    });

    res.json({ success: true, data: updated });
  }),
);

// DELETE /hr/advances/:id
// Allows deletion only if the advance is still PENDING (no payment ever deducted).
// Prevents accidentally deleting a PARTIAL advance that has real payment history.
advanceRouter.delete(
  "/:id",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.staffAdvance.findUnique({ where: { id } });
    if (!existing) throw notFound("Staff advance not found");

    if (existing.status !== "PENDING") {
      throw badRequest(`Cannot delete an advance with status "${existing.status}". Only PENDING advances (no deduction made yet) can be deleted.`);
    }

    await prisma.staffAdvance.delete({ where: { id } });
    res.json({ success: true, data: { id } });
  }),
);
