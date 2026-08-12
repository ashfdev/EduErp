import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { PAYROLL_MANAGE_ROLES } from "../../lib/roles";
import { badRequest, notFound } from "../../lib/errors";
import { logAudit } from "../../lib/audit-log";

export const pfRouter = Router();
pfRouter.use(authenticate);

// GET /hr/pf/:staff_id
// Returns the staff member's PF balance and full transaction history.
// Creates a zero-balance PF record if one doesn't exist yet (upsert) so
// the frontend always gets a well-shaped response without a separate
// "initialize PF" step for each staff member.
pfRouter.get(
  "/:staff_id",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const staffId = reqParam(req, "staff_id");

    const staff = await prisma.staff.findFirst({ where: { id: staffId, deleted_at: null } });
    if (!staff) throw notFound("Staff not found");

    // Upsert: ensures every staff member always has exactly one PF record.
    const pf = await prisma.providentFund.upsert({
      where: { staff_id: staffId },
      create: { staff_id: staffId, total_balance: 0 },
      update: {},
      include: {

        transactions: { orderBy: { date: "desc" } },
      },
    });

    res.json({ success: true, data: pf });
  }),
);

// GET /hr/pf
// List all PF accounts with balances (for the HR overview page).
pfRouter.get(
  "/",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (_req, res) => {
    const accounts = await prisma.providentFund.findMany({
      include: {
        staff: { select: { id: true, name_en: true, staff_uid: true, department: { select: { name_en: true } } } },
        _count: { select: { transactions: true } },
      },
      orderBy: { total_balance: "desc" },
    });
    res.json({ success: true, data: accounts });
  }),
);

// POST /hr/pf/withdraw
// Process a manual PF withdrawal for a staff member.
// Validates balance sufficiency before creating the transaction.
pfRouter.post(
  "/withdraw",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        staff_id: z.string().min(1),
        amount: z.number().positive("Withdrawal amount must be positive"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
        description: z.string().optional(),
      })
      .parse(req.body);

    const staff = await prisma.staff.findFirst({ where: { id: body.staff_id, deleted_at: null } });
    if (!staff) throw notFound("Staff not found");

    // FOR UPDATE serializes any concurrent withdrawal for the same staff
    // member behind this one -- without it, two concurrent requests could
    // both read the same pre-decrement balance, both pass the sufficiency
    // check below, and both commit, pushing total_balance negative (the
    // same lost-update race already fixed for Invoice.amount_paid in
    // fees.routes.ts's /collect and for Item.current_stock in
    // items.routes.ts's /stock/issue -- found here during a fresh audit
    // pass, 2026-08-12, following the identical pattern).
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ProvidentFund" WHERE staff_id = ${body.staff_id} FOR UPDATE`;
      const pf = await tx.providentFund.findUnique({ where: { staff_id: body.staff_id } });

      if (!pf) {
        throw badRequest("This staff member has no Provident Fund account yet. A PF account is created automatically on the first payroll finalization that includes a PF contribution.");
      }

      if (pf.total_balance < body.amount) {
        throw badRequest(`Insufficient PF balance. Available: ৳${pf.total_balance.toFixed(2)}, Requested: ৳${body.amount.toFixed(2)}.`);
      }

      const updated = await tx.providentFund.update({
        where: { id: pf.id },
        data: { total_balance: { decrement: body.amount } },
      });

      const txRecord = await tx.pFTransaction.create({
        data: {
          provident_fund_id: pf.id,
          transaction_type: "WITHDRAWAL",
          amount: body.amount,
          date: new Date(body.date),
          description: body.description ?? "Manual withdrawal",
        },
      });

      return { pf: updated, transaction: txRecord };
    });

    await logAudit("PF_WITHDRAWAL", {
      userId: req.user?.sub,
      targetType: "ProvidentFund",
      targetId: result.pf.id,
      metadata: { staff_id: body.staff_id, amount: body.amount, new_balance: result.pf.total_balance },
      req,
    });

    res.status(201).json({ success: true, data: result });
  }),
);
