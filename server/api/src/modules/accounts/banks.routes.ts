import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { ACCOUNTS_MANAGE_ROLES } from "../../lib/roles";
import { bankAccountSchema, chequeSchema } from "@education-erp/validators";
import { badRequest, notFound } from "../../lib/errors";

export const banksRouter = Router();
banksRouter.use(authenticate, authorize(ACCOUNTS_MANAGE_ROLES));

async function currentBalance(accountId: string): Promise<number> {
  const [debitAgg, creditAgg] = await Promise.all([
    prisma.journalEntry.aggregate({ where: { debit_account_id: accountId, voucher: { status: "POSTED" } }, _sum: { amount: true } }),
    prisma.journalEntry.aggregate({ where: { credit_account_id: accountId, voucher: { status: "POSTED" } }, _sum: { amount: true } }),
  ]);
  return (debitAgg._sum.amount ?? 0) - (creditAgg._sum.amount ?? 0);
}

banksRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const banks = await prisma.bankAccount.findMany({ include: { account: true }, orderBy: { bank_name: "asc" } });
    const withBalances = await Promise.all(banks.map(async (b) => ({ ...b, current_balance: await currentBalance(b.account_id) })));
    res.json({ success: true, data: withBalances });
  }),
);

banksRouter.post(
  "/",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = bankAccountSchema.parse(req.body);
    const bank = await prisma.bankAccount.create({ data: body });
    await prisma.account.update({ where: { id: body.account_id }, data: { is_bank_account: true } });
    res.status(201).json({ success: true, data: bank });
  }),
);

banksRouter.put(
  "/:id",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = bankAccountSchema.partial().parse(req.body);
    const bank = await prisma.bankAccount.update({ where: { id }, data: body });
    res.json({ success: true, data: bank });
  }),
);

banksRouter.post(
  "/:id/reconcile/start",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const query = z.object({ month: z.coerce.number().int().min(1).max(12), year: z.coerce.number().int() }).parse(req.query);
    const bank = await prisma.bankAccount.findUnique({ where: { id } });
    if (!bank) throw notFound("Bank account not found");

    const bookBalance = await currentBalance(bank.account_id);
    const uncleared = await prisma.chequeEntry.findMany({ where: { bank_account_id: id, status: "PENDING" } });

    const reconciliation = await prisma.bankReconciliation.upsert({
      where: { bank_account_id_month_year: { bank_account_id: id, month: query.month, year: query.year } },
      update: {},
      create: {
        bank_account_id: id,
        month: query.month,
        year: query.year,
        statement_balance: 0,
        book_balance: bookBalance,
        difference: bookBalance,
        items: {
          create: uncleared.map((c) => ({
            description: `${c.cheque_type === "ISSUED" ? "Cheque issued" : "Cheque received"} #${c.cheque_no} — ${c.payee}`,
            amount: c.amount,
            item_type: "IN_BOOK_NOT_BANK" as const,
          })),
        },
      },
      include: { items: true },
    });

    res.json({ success: true, data: reconciliation });
  }),
);

banksRouter.put(
  "/:id/reconcile",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = z.object({ month: z.coerce.number().int(), year: z.coerce.number().int(), statement_balance: z.number(), items: z.array(z.object({ id: z.string(), is_reconciled: z.boolean() })) }).parse(req.body);

    const reconciliation = await prisma.bankReconciliation.findUnique({ where: { bank_account_id_month_year: { bank_account_id: id, month: body.month, year: body.year } } });
    if (!reconciliation) throw notFound("Reconciliation not started for this period");

    await prisma.$transaction(
      body.items.map((item) => prisma.reconciliationItem.update({ where: { id: item.id }, data: { is_reconciled: item.is_reconciled } })),
    );

    const unreconciledTotal = await prisma.reconciliationItem.aggregate({
      where: { reconciliation_id: reconciliation.id, is_reconciled: false },
      _sum: { amount: true },
    });
    const difference = reconciliation.book_balance - body.statement_balance - (unreconciledTotal._sum.amount ?? 0);

    const updated = await prisma.bankReconciliation.update({
      where: { id: reconciliation.id },
      data: {
        statement_balance: body.statement_balance,
        difference,
        status: Math.abs(difference) < 0.01 ? "RECONCILED" : "PENDING",
        reconciled_at: Math.abs(difference) < 0.01 ? new Date() : undefined,
      },
      include: { items: true },
    });

    res.json({ success: true, data: updated });
  }),
);

// ── Cheques (mounted at /api/accounts/cheques, not nested under /banks) ──

export const chequesRouter = Router();
chequesRouter.use(authenticate, authorize(ACCOUNTS_MANAGE_ROLES));

chequesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z.object({ bank_account_id: z.string().optional(), status: z.string().optional(), type: z.string().optional() }).parse(req.query);
    const cheques = await prisma.chequeEntry.findMany({
      where: {
        ...(query.bank_account_id && { bank_account_id: query.bank_account_id }),
        ...(query.status && { status: query.status as never }),
        ...(query.type && { cheque_type: query.type as never }),
      },
      orderBy: { cheque_date: "desc" },
    });
    res.json({ success: true, data: cheques });
  }),
);

chequesRouter.post(
  "/",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = chequeSchema.parse(req.body);
    const cheque = await prisma.chequeEntry.create({ data: body });
    res.status(201).json({ success: true, data: cheque });
  }),
);

chequesRouter.put(
  "/:id/clear",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const cheque = await prisma.chequeEntry.update({ where: { id }, data: { status: "CLEARED", cleared_at: new Date() } });
    res.json({ success: true, data: cheque });
  }),
);

chequesRouter.put(
  "/:id/bounce",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const cheque = await prisma.chequeEntry.update({ where: { id }, data: { status: "BOUNCED" } });
    res.json({ success: true, data: cheque });
  }),
);

// ── TDS / VAT ─────────────────────────────────────────────────────

export const taxRouter = Router();
taxRouter.use(authenticate, authorize(ACCOUNTS_MANAGE_ROLES));

taxRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z.object({ tax_type: z.string().optional(), is_paid: z.string().optional(), period: z.string().optional() }).parse(req.query);
    const entries = await prisma.taxEntry.findMany({
      where: {
        ...(query.tax_type && { tax_type: query.tax_type as never }),
        ...(query.is_paid !== undefined && { is_paid: query.is_paid === "true" }),
        ...(query.period && { period: query.period }),
      },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: entries });
  }),
);

taxRouter.post(
  "/generate-challan",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = z.object({ tax_type: z.enum(["TDS", "VAT"]), period: z.string().min(1) }).parse(req.body);
    const entries = await prisma.taxEntry.findMany({ where: { tax_type: body.tax_type, period: body.period, is_paid: false } });
    if (!entries.length) throw badRequest("No unpaid tax entries found for this period");
    const total = entries.reduce((sum, e) => sum + e.tax_amount, 0);
    res.json({ success: true, data: { tax_type: body.tax_type, period: body.period, entries, total } });
  }),
);

taxRouter.put(
  "/:id/mark-paid",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = z.object({ challan_no: z.string().min(1), paid_at: z.coerce.date().optional() }).parse(req.body);
    const entry = await prisma.taxEntry.update({ where: { id }, data: { is_paid: true, challan_no: body.challan_no, paid_at: body.paid_at ?? new Date() } });
    res.json({ success: true, data: entry });
  }),
);
