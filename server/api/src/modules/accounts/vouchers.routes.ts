import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { ACCOUNTS_MANAGE_ROLES, VOUCHER_APPROVE_ROLES, VOUCHER_POST_ROLES } from "../../lib/roles";
import { voucherSchema } from "@education-erp/validators";
import { createVoucher, validateBalance } from "./voucher-helpers";
import { badRequest, forbidden, notFound } from "../../lib/errors";

export const vouchersRouter = Router();
vouchersRouter.use(authenticate);

vouchersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        financial_year_id: z.string().optional(),
        type: z.string().optional(),
        status: z.string().optional(),
        from_date: z.coerce.date().optional(),
        to_date: z.coerce.date().optional(),
        search: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);

    const where = {
      ...(query.financial_year_id && { financial_year_id: query.financial_year_id }),
      ...(query.type && { voucher_type: query.type as never }),
      ...(query.status && { status: query.status as never }),
      ...((query.from_date || query.to_date) && { date: { ...(query.from_date && { gte: query.from_date }), ...(query.to_date && { lte: query.to_date }) } }),
      ...(query.search && { narration: { contains: query.search, mode: "insensitive" as const } }),
      deleted_at: null,
    };

    const [items, total] = await Promise.all([
      prisma.voucher.findMany({ where, orderBy: { date: "desc" }, skip: (query.page - 1) * query.limit, take: query.limit }),
      prisma.voucher.count({ where }),
    ]);

    res.json({ success: true, data: items, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
  }),
);

vouchersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const voucher = await prisma.voucher.findUnique({
      where: { id },
      include: {
        journal_entries: { include: { debit_account: true, credit_account: true } },
        financial_year: true,
      },
    });
    if (!voucher) throw notFound("Voucher not found");
    res.json({ success: true, data: voucher });
  }),
);

vouchersRouter.post(
  "/",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = voucherSchema.parse(req.body);
    const voucher = await createVoucher(prisma, {
      voucher_type: body.voucher_type,
      date: body.date,
      narration: body.narration,
      narration_bn: body.narration_bn,
      reference_no: body.reference_no,
      entries: body.entries,
      created_by_id: req.user!.sub,
    });
    res.status(201).json({ success: true, data: voucher });
  }),
);

vouchersRouter.put(
  "/:id",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.voucher.findUnique({ where: { id } });
    if (!existing) throw notFound("Voucher not found");
    if (existing.status !== "DRAFT") throw forbidden("Only DRAFT vouchers can be edited");

    const body = voucherSchema.parse(req.body);
    const { totalDebit } = validateBalance(body.entries);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.journalEntry.deleteMany({ where: { voucher_id: id } });
      return tx.voucher.update({
        where: { id },
        data: {
          voucher_type: body.voucher_type,
          date: body.date,
          narration: body.narration,
          narration_bn: body.narration_bn,
          reference_no: body.reference_no,
          total_amount: totalDebit,
          journal_entries: {
            create: body.entries.map((e) => ({
              debit_account_id: e.debit_account_id ?? undefined,
              credit_account_id: e.credit_account_id ?? undefined,
              amount: e.amount,
              narration: e.narration,
            })),
          },
        },
        include: { journal_entries: true },
      });
    });

    res.json({ success: true, data: updated });
  }),
);

vouchersRouter.post(
  "/:id/approve",
  authorize(VOUCHER_APPROVE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.voucher.findUnique({ where: { id } });
    if (!existing) throw notFound("Voucher not found");
    if (existing.status !== "DRAFT") throw badRequest("Only DRAFT vouchers can be approved");

    const voucher = await prisma.voucher.update({ where: { id }, data: { status: "APPROVED", approved_by_id: req.user!.sub, approved_at: new Date() } });
    res.json({ success: true, data: voucher });
  }),
);

vouchersRouter.post(
  "/:id/post",
  authorize(VOUCHER_POST_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.voucher.findUnique({ where: { id } });
    if (!existing) throw notFound("Voucher not found");
    if (existing.status !== "APPROVED") throw badRequest("Only APPROVED vouchers can be posted");

    const voucher = await prisma.voucher.update({ where: { id }, data: { status: "POSTED" } });
    res.json({ success: true, data: voucher });
  }),
);

vouchersRouter.post(
  "/:id/cancel",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.voucher.findUnique({ where: { id } });
    if (!existing) throw notFound("Voucher not found");
    if (existing.status === "POSTED") throw forbidden("Cannot cancel a posted voucher — reverse it with a new voucher instead");

    const voucher = await prisma.voucher.update({ where: { id }, data: { status: "CANCELLED" } });
    res.json({ success: true, data: voucher });
  }),
);

vouchersRouter.delete(
  "/:id",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.voucher.findUnique({ where: { id } });
    if (!existing) throw notFound("Voucher not found");
    if (existing.status === "POSTED") throw forbidden("Cannot delete a posted voucher");

    await prisma.voucher.update({ where: { id }, data: { deleted_at: new Date() } });
    res.status(204).send();
  }),
);

// ── Ledger ────────────────────────────────────────────────────────

export const ledgerRouter = Router();
ledgerRouter.use(authenticate);

ledgerRouter.get(
  "/:account_id",
  asyncHandler(async (req, res) => {
    const accountId = reqParam(req, "account_id");
    const query = z.object({ from_date: z.coerce.date().optional(), to_date: z.coerce.date().optional() }).parse(req.query);

    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw notFound("Account not found");

    const entries = await prisma.journalEntry.findMany({
      where: {
        OR: [{ debit_account_id: accountId }, { credit_account_id: accountId }],
        voucher: {
          status: "POSTED",
          ...((query.from_date || query.to_date) && { date: { ...(query.from_date && { gte: query.from_date }), ...(query.to_date && { lte: query.to_date }) } }),
        },
      },
      include: { voucher: true },
      orderBy: { voucher: { date: "asc" } },
    });

    // Opening balance = everything posted to this account before from_date
    // (or account.opening_balance if no from_date filter is set).
    let openingBalance = account.opening_balance_type === "DEBIT" ? account.opening_balance : -account.opening_balance;
    if (query.from_date) {
      const priorEntries = await prisma.journalEntry.findMany({
        where: { OR: [{ debit_account_id: accountId }, { credit_account_id: accountId }], voucher: { status: "POSTED", date: { lt: query.from_date } } },
      });
      for (const e of priorEntries) {
        if (e.debit_account_id === accountId) openingBalance += e.amount;
        if (e.credit_account_id === accountId) openingBalance -= e.amount;
      }
    }

    let runningBalance = openingBalance;
    let totalDebit = 0;
    let totalCredit = 0;
    const rows = entries.map((e) => {
      const debit = e.debit_account_id === accountId ? e.amount : 0;
      const credit = e.credit_account_id === accountId ? e.amount : 0;
      totalDebit += debit;
      totalCredit += credit;
      runningBalance += debit - credit;
      return {
        date: e.voucher.date,
        voucher_no: e.voucher.voucher_no,
        voucher_id: e.voucher.id,
        voucher_type: e.voucher.voucher_type,
        narration: e.narration ?? e.voucher.narration,
        debit,
        credit,
        running_balance: Math.round(runningBalance * 100) / 100,
      };
    });

    res.json({
      success: true,
      data: {
        account: { id: account.id, code: account.code, name: account.name, name_bn: account.name_bn, nature: account.account_nature },
        opening_balance: { amount: Math.abs(openingBalance), type: openingBalance >= 0 ? "DR" : "CR" },
        entries: rows,
        closing_balance: { amount: Math.abs(runningBalance), type: runningBalance >= 0 ? "DR" : "CR" },
        total_debit: totalDebit,
        total_credit: totalCredit,
      },
    });
  }),
);
