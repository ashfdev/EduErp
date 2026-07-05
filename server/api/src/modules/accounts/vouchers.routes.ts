import { Router } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { csvUpload } from "../../middleware/upload";
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

// Placed before "/:id" — Express matches routes in definition order, and
// both are single-segment patterns, so "/export" must come first or it
// would be swallowed as an :id lookup.
vouchersRouter.get(
  "/export",
  asyncHandler(async (req, res) => {
    const query = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), type: z.string().optional() }).parse(req.query);
    const vouchers = await prisma.voucher.findMany({
      where: {
        deleted_at: null,
        status: "POSTED",
        ...((query.from || query.to) && { date: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) } }),
        ...(query.type && { voucher_type: query.type as never }),
      },
      include: { journal_entries: { include: { debit_account: true, credit_account: true } } },
      orderBy: { date: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Vouchers");
    // Same "wide" shape as the bulk-import format (one row = one journal-entry
    // leg, grouped by voucher_no) so an export can be edited and re-imported.
    sheet.columns = [
      { header: "Voucher No", key: "voucher_no", width: 16 },
      { header: "Date", key: "date", width: 12 },
      { header: "Type", key: "type", width: 12 },
      { header: "Narration", key: "narration", width: 35 },
      { header: "Debit Account Code", key: "debit_account_code", width: 16 },
      { header: "Credit Account Code", key: "credit_account_code", width: 16 },
      { header: "Amount", key: "amount", width: 14 },
    ];
    for (const v of vouchers) {
      for (const e of v.journal_entries) {
        sheet.addRow({
          voucher_no: v.voucher_no,
          date: v.date.toISOString().slice(0, 10),
          type: v.voucher_type,
          narration: e.narration ?? v.narration,
          debit_account_code: e.debit_account?.code ?? "",
          credit_account_code: e.credit_account?.code ?? "",
          amount: e.amount,
        });
      }
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Vouchers.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
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

// "Wide" CSV — one row = one journal-entry leg, grouped by a shared
// row_group_id into a single voucher (a voucher normally has 2+ legs, so a
// row-per-line shape is unavoidable, unlike the single-row-per-record shape
// the students/chart-of-accounts importers use).
vouchersRouter.post(
  "/bulk-import",
  authorize(ACCOUNTS_MANAGE_ROLES),
  csvUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("A CSV file is required");
    const records: Record<string, string>[] = parse(req.file.buffer.toString("utf-8"), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const codes = [...new Set(records.flatMap((r) => [r.debit_account_code, r.credit_account_code]).filter((c): c is string => !!c))];
    const accounts = await prisma.account.findMany({ where: { code: { in: codes } } });
    const accountCodeSet = new Set(accounts.map((a) => a.code));

    const groups = new Map<string, { row: number; data: Record<string, string> }[]>();
    let ungroupedRows = 0;
    records.forEach((row, index) => {
      if (!row.row_group_id) {
        ungroupedRows++;
        return;
      }
      if (!groups.has(row.row_group_id)) groups.set(row.row_group_id, []);
      groups.get(row.row_group_id)!.push({ row: index + 1, data: row });
    });

    const preview = [...groups.entries()].map(([groupId, rows]) => {
      const errors: string[] = [];
      let totalDebit = 0;
      let totalCredit = 0;

      for (const { row, data } of rows) {
        const lineErrors: string[] = [];
        if (!data.date) lineErrors.push("date is required");
        if (!data.narration) lineErrors.push("narration is required");
        const amount = Number(data.amount);
        const hasAmount = data.amount !== undefined && data.amount !== "" && !Number.isNaN(amount) && amount > 0;
        if (!hasAmount) lineErrors.push("amount must be a positive number");
        const debitCode = data.debit_account_code;
        const creditCode = data.credit_account_code;
        if (!debitCode && !creditCode) lineErrors.push("either debit_account_code or credit_account_code is required");
        if (debitCode && creditCode) lineErrors.push("a line can only have one of debit_account_code or credit_account_code, not both");
        if (debitCode && !accountCodeSet.has(debitCode)) lineErrors.push(`debit account code "${debitCode}" not found`);
        if (creditCode && !accountCodeSet.has(creditCode)) lineErrors.push(`credit account code "${creditCode}" not found`);
        if (hasAmount) {
          if (debitCode) totalDebit += amount;
          if (creditCode) totalCredit += amount;
        }
        if (lineErrors.length) errors.push(`Row ${row}: ${lineErrors.join("; ")}`);
      }

      const roundedDebit = Math.round(totalDebit * 100) / 100;
      const roundedCredit = Math.round(totalCredit * 100) / 100;
      if (roundedDebit !== roundedCredit) errors.push(`Group is unbalanced — debit ৳${roundedDebit} vs credit ৳${roundedCredit}`);

      return {
        row_group_id: groupId,
        date: rows[0]!.data.date,
        narration: rows[0]!.data.narration,
        lines: rows.map((r) => r.data),
        total_amount: roundedDebit,
        valid: errors.length === 0,
        errors,
      };
    });

    res.json({
      success: true,
      data: { total: preview.length, valid: preview.filter((p) => p.valid).length, ungrouped_rows: ungroupedRows, preview },
    });
  }),
);

vouchersRouter.post(
  "/bulk-import/confirm",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        groups: z.array(
          z.object({
            row_group_id: z.string().min(1),
            date: z.coerce.date(),
            narration: z.string().min(1),
            lines: z
              .array(
                z.object({
                  debit_account_code: z.string().optional(),
                  credit_account_code: z.string().optional(),
                  amount: z.coerce.number().positive(),
                  narration: z.string().optional(),
                }),
              )
              .min(1),
          }),
        ),
      })
      .parse(req.body);

    const codes = [...new Set(body.groups.flatMap((g) => g.lines.flatMap((l) => [l.debit_account_code, l.credit_account_code])).filter((c): c is string => !!c))];
    const accounts = await prisma.account.findMany({ where: { code: { in: codes } } });
    const accountByCode = new Map(accounts.map((a) => [a.code, a]));

    const created: string[] = [];
    const failed: { row_group_id: string; reason: string }[] = [];

    for (const group of body.groups) {
      try {
        const entries = group.lines.map((l) => ({
          debit_account_id: l.debit_account_code ? accountByCode.get(l.debit_account_code)?.id : undefined,
          credit_account_id: l.credit_account_code ? accountByCode.get(l.credit_account_code)?.id : undefined,
          amount: l.amount,
          narration: l.narration,
        }));
        const voucher = await prisma.$transaction((tx) =>
          createVoucher(tx, {
            voucher_type: "JOURNAL",
            date: group.date,
            narration: group.narration,
            entries,
            created_by_id: req.user!.sub,
          }),
        );
        created.push(voucher.voucher_no);
      } catch (err) {
        failed.push({ row_group_id: group.row_group_id, reason: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    res.json({ success: true, data: { created: created.length, failed } });
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

// Shared by both the JSON ledger endpoint and its Excel export — the
// balance-computation logic (opening balance, running balance) lives in
// exactly one place.
async function computeLedger(accountId: string, fromDate?: Date, toDate?: Date) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw notFound("Account not found");

  const entries = await prisma.journalEntry.findMany({
    where: {
      OR: [{ debit_account_id: accountId }, { credit_account_id: accountId }],
      voucher: {
        status: "POSTED",
        ...((fromDate || toDate) && { date: { ...(fromDate && { gte: fromDate }), ...(toDate && { lte: toDate }) } }),
      },
    },
    include: { voucher: true },
    orderBy: { voucher: { date: "asc" } },
  });

  // Opening balance = everything posted to this account before from_date
  // (or account.opening_balance if no from_date filter is set).
  let openingBalance = account.opening_balance_type === "DEBIT" ? account.opening_balance : -account.opening_balance;
  if (fromDate) {
    const priorEntries = await prisma.journalEntry.findMany({
      where: { OR: [{ debit_account_id: accountId }, { credit_account_id: accountId }], voucher: { status: "POSTED", date: { lt: fromDate } } },
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

  return {
    account: { id: account.id, code: account.code, name: account.name, name_bn: account.name_bn, nature: account.account_nature },
    opening_balance: { amount: Math.abs(openingBalance), type: openingBalance >= 0 ? "DR" : "CR" as const },
    entries: rows,
    closing_balance: { amount: Math.abs(runningBalance), type: runningBalance >= 0 ? "DR" : "CR" as const },
    total_debit: totalDebit,
    total_credit: totalCredit,
  };
}

ledgerRouter.get(
  "/:account_id",
  asyncHandler(async (req, res) => {
    const accountId = reqParam(req, "account_id");
    const query = z.object({ from_date: z.coerce.date().optional(), to_date: z.coerce.date().optional() }).parse(req.query);
    const data = await computeLedger(accountId, query.from_date, query.to_date);
    res.json({ success: true, data });
  }),
);

// Placed after "/:account_id" would shadow "/:account_id/export" as a
// two-segment path — no collision, since a single-segment "/:account_id"
// pattern never matches a two-segment URL.
ledgerRouter.get(
  "/:account_id/export",
  asyncHandler(async (req, res) => {
    const accountId = reqParam(req, "account_id");
    const query = z.object({ from_date: z.coerce.date().optional(), to_date: z.coerce.date().optional() }).parse(req.query);
    const data = await computeLedger(accountId, query.from_date, query.to_date);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Ledger");
    // Column widths only (no `header` property) — with `header` set, ExcelJS
    // auto-writes a header row into row 1, which would collide with the
    // title/opening-balance rows added manually below.
    sheet.columns = [{ width: 12 }, { width: 16 }, { width: 12 }, { width: 35 }, { width: 14 }, { width: 14 }, { width: 16 }];

    sheet.addRow([`${data.account.code} - ${data.account.name}`]);
    sheet.addRow([`Opening Balance: ৳${data.opening_balance.amount} ${data.opening_balance.type}`]);
    sheet.addRow([]);
    sheet.addRow(["Date", "Voucher No", "Type", "Narration", "Debit", "Credit", "Running Balance"]);
    for (const e of data.entries) {
      sheet.addRow([e.date.toISOString().slice(0, 10), e.voucher_no, e.voucher_type, e.narration, e.debit || "", e.credit || "", e.running_balance]);
    }
    sheet.addRow([]);
    sheet.addRow([`Closing Balance: ৳${data.closing_balance.amount} ${data.closing_balance.type}`]);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Ledger_${data.account.code}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  }),
);
