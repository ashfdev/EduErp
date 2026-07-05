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
import { ACCOUNTS_MANAGE_ROLES } from "../../lib/roles";
import { accountSchema, financialYearSchema } from "@education-erp/validators";
import { badRequest, conflict, notFound } from "../../lib/errors";

// CSV/JSON booleans arrive as strings ("true"/""/"TRUE") from a spreadsheet,
// not real booleans — z.coerce.boolean() would wrongly treat "false" as
// truthy (any non-empty string coerces to true), so this parses explicitly.
const csvBoolean = z.preprocess((v) => v === true || v === "true" || v === "TRUE" || v === "1", z.boolean());

export const accountsRouter = Router();
accountsRouter.use(authenticate);

// System accounts (is_system=true) are auto-created by the seed and cover
// the codes every auto-journal/report relies on — never deletable, code
// never editable, matching CLAUDE.md's "account codes are system-reserved" rule.
const SYSTEM_RESERVED_CODES = ["1001", "1002", "1003", "2002", "2003", "2004", "3004", "4001", "4002", "4003", "5001", "5002", "5018"];

async function accountBalance(accountId: string): Promise<{ debit: number; credit: number; balance: number }> {
  const [debitAgg, creditAgg] = await Promise.all([
    prisma.journalEntry.aggregate({ where: { debit_account_id: accountId, voucher: { status: "POSTED" } }, _sum: { amount: true } }),
    prisma.journalEntry.aggregate({ where: { credit_account_id: accountId, voucher: { status: "POSTED" } }, _sum: { amount: true } }),
  ]);
  const debit = debitAgg._sum.amount ?? 0;
  const credit = creditAgg._sum.amount ?? 0;
  return { debit, credit, balance: debit - credit };
}

accountsRouter.get(
  "/chart",
  asyncHandler(async (req, res) => {
    const query = z.object({ type: z.string().optional(), is_active: z.string().optional() }).parse(req.query);
    const groups = await prisma.accountGroup.findMany({
      orderBy: { display_order: "asc" },
      include: {
        accounts: {
          where: { ...(query.type && { account_group: { type: query.type as never } }), ...(query.is_active !== undefined && { is_active: query.is_active === "true" }) },
          orderBy: { code: "asc" },
        },
      },
    });

    const groupsWithBalances = await Promise.all(
      groups.map(async (group) => ({
        ...group,
        accounts: await Promise.all(
          group.accounts.map(async (account) => {
            const { balance } = await accountBalance(account.id);
            // A DEBIT_NORMAL account's natural balance is (debit - credit);
            // for a CREDIT_NORMAL account it's the mirror, (credit - debit).
            const displayBalance = account.account_nature === "DEBIT_NORMAL" ? balance : -balance;
            return { ...account, balance: displayBalance + (account.opening_balance_type === "DEBIT" ? account.opening_balance : -account.opening_balance) };
          }),
        ),
      })),
    );

    res.json({ success: true, data: groupsWithBalances });
  }),
);

accountsRouter.get(
  "/chart/export",
  asyncHandler(async (_req, res) => {
    const accounts = await prisma.account.findMany({ include: { account_group: true }, orderBy: { code: "asc" } });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Chart of Accounts");
    sheet.columns = [
      { header: "Code", key: "code", width: 12 },
      { header: "Name", key: "name", width: 30 },
      { header: "Name (Bangla)", key: "name_bn", width: 20 },
      { header: "Account Group", key: "account_group", width: 20 },
      { header: "Account Nature", key: "account_nature", width: 16 },
      { header: "Opening Balance", key: "opening_balance", width: 16 },
      { header: "Opening Balance Type", key: "opening_balance_type", width: 14 },
      { header: "Is Bank Account", key: "is_bank_account", width: 14 },
      { header: "Is Cash Account", key: "is_cash_account", width: 14 },
      { header: "Active", key: "is_active", width: 10 },
    ];
    for (const a of accounts) {
      sheet.addRow({
        code: a.code,
        name: a.name,
        name_bn: a.name_bn ?? "",
        account_group: a.account_group.name,
        account_nature: a.account_nature,
        opening_balance: a.opening_balance,
        opening_balance_type: a.opening_balance_type,
        is_bank_account: a.is_bank_account,
        is_cash_account: a.is_cash_account,
        is_active: a.is_active,
      });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Chart_of_Accounts.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  }),
);

accountsRouter.post(
  "/chart/bulk-import",
  authorize(ACCOUNTS_MANAGE_ROLES),
  csvUpload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("A CSV file is required");
    const records: Record<string, string>[] = parse(req.file.buffer.toString("utf-8"), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const groups = await prisma.accountGroup.findMany();
    const groupByName = new Map(groups.map((g) => [g.name.toLowerCase(), g]));
    const existingCodes = new Set((await prisma.account.findMany({ select: { code: true } })).map((a) => a.code));
    const seenInFile = new Set<string>();

    const preview = records.map((row, index) => {
      const errors: string[] = [];
      const group = row.account_group ? groupByName.get(row.account_group.trim().toLowerCase()) : undefined;

      if (!row.code) errors.push("code is required");
      if (!row.name) errors.push("name is required");
      if (!row.account_group) errors.push("account_group is required");
      else if (!group) errors.push(`account_group "${row.account_group}" does not match any existing group`);
      if (!row.account_nature || !["DEBIT_NORMAL", "CREDIT_NORMAL"].includes(row.account_nature)) {
        errors.push("account_nature must be DEBIT_NORMAL or CREDIT_NORMAL");
      }
      if (row.code) {
        if (SYSTEM_RESERVED_CODES.includes(row.code)) errors.push("code is reserved for a system account");
        if (existingCodes.has(row.code)) errors.push("an account with this code already exists");
        if (seenInFile.has(row.code)) errors.push("duplicate code within this file");
        seenInFile.add(row.code);
      }

      return {
        row: index + 1,
        data: { ...row, account_group_id: group?.id },
        valid: errors.length === 0,
        errors,
      };
    });

    res.json({ success: true, data: { total: preview.length, valid: preview.filter((p) => p.valid).length, preview } });
  }),
);

accountsRouter.post(
  "/chart/bulk-import/confirm",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        rows: z.array(
          z.object({
            code: z.string().min(1),
            name: z.string().min(1),
            name_bn: z.string().optional(),
            account_group_id: z.string().min(1),
            account_nature: z.enum(["DEBIT_NORMAL", "CREDIT_NORMAL"]),
            opening_balance: z.coerce.number().default(0),
            opening_balance_type: z.enum(["DEBIT", "CREDIT"]).default("DEBIT"),
            is_bank_account: csvBoolean.default(false),
            is_cash_account: csvBoolean.default(false),
          }),
        ),
      })
      .parse(req.body);

    const created: string[] = [];
    const failed: { row: number; reason: string }[] = [];

    for (const [index, row] of body.rows.entries()) {
      try {
        if (SYSTEM_RESERVED_CODES.includes(row.code)) throw new Error("code is reserved for a system account");
        const existing = await prisma.account.findUnique({ where: { code: row.code } });
        if (existing) throw new Error("An account with this code already exists");
        const account = await prisma.account.create({ data: row });
        created.push(account.code);
      } catch (err) {
        failed.push({ row: index + 1, reason: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    res.json({ success: true, data: { created: created.length, failed } });
  }),
);

accountsRouter.get(
  "/search",
  asyncHandler(async (req, res) => {
    const query = z.object({ q: z.string().optional(), type: z.string().optional() }).parse(req.query);
    const accounts = await prisma.account.findMany({
      where: {
        is_active: true,
        ...(query.type && { account_group: { type: query.type as never } }),
        ...(query.q && { OR: [{ code: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }] }),
      },
      include: { account_group: { select: { name: true, type: true } } },
      orderBy: { code: "asc" },
      take: 30,
    });
    res.json({ success: true, data: accounts });
  }),
);

accountsRouter.post(
  "/",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = accountSchema.parse(req.body);
    if (SYSTEM_RESERVED_CODES.includes(body.code)) throw conflict("This account code is reserved for a system account");
    const existing = await prisma.account.findUnique({ where: { code: body.code } });
    if (existing) throw conflict("An account with this code already exists");

    const account = await prisma.account.create({ data: body });
    res.status(201).json({ success: true, data: account });
  }),
);

accountsRouter.put(
  "/:id",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.account.findUnique({ where: { id } });
    if (!existing) throw notFound("Account not found");

    const body = accountSchema.partial().parse(req.body);
    if (existing.is_system) {
      if (body.code && body.code !== existing.code) throw badRequest("Cannot change the code of a system account");
      if (body.account_nature && body.account_nature !== existing.account_nature) throw badRequest("Cannot change the nature of a system account");
    }
    if (body.account_nature && body.account_nature !== existing.account_nature) {
      const hasEntries = await prisma.journalEntry.findFirst({ where: { OR: [{ debit_account_id: id }, { credit_account_id: id }] } });
      if (hasEntries) throw badRequest("Cannot change account nature — journal entries already exist for this account");
    }

    const account = await prisma.account.update({ where: { id }, data: body });
    res.json({ success: true, data: account });
  }),
);

accountsRouter.delete(
  "/:id",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.account.findUnique({ where: { id } });
    if (!existing) throw notFound("Account not found");
    if (existing.is_system) throw badRequest("System accounts cannot be deleted");

    const hasEntries = await prisma.journalEntry.findFirst({ where: { OR: [{ debit_account_id: id }, { credit_account_id: id }] } });
    if (hasEntries) throw badRequest("Cannot delete an account with existing journal entries");

    await prisma.account.update({ where: { id }, data: { is_active: false } });
    res.status(204).send();
  }),
);

// ── Financial Years ──────────────────────────────────────────────

accountsRouter.get(
  "/financial-years",
  asyncHandler(async (_req, res) => {
    const years = await prisma.financialYear.findMany({ orderBy: { start_date: "desc" } });
    res.json({ success: true, data: years });
  }),
);

accountsRouter.post(
  "/financial-years",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = financialYearSchema.parse(req.body);
    const year = await prisma.financialYear.create({ data: body });
    res.status(201).json({ success: true, data: year });
  }),
);

accountsRouter.put(
  "/financial-years/:id/activate",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    await prisma.$transaction([
      prisma.financialYear.updateMany({ where: { is_active: true }, data: { is_active: false } }),
      prisma.financialYear.update({ where: { id }, data: { is_active: true } }),
    ]);
    res.json({ success: true, message: "Financial year activated" });
  }),
);

accountsRouter.post(
  "/financial-years/:id/close",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = z.object({ confirmed: z.literal(true) }).parse(req.body);
    void body;
    const year = await prisma.financialYear.findUnique({ where: { id } });
    if (!year) throw notFound("Financial year not found");
    if (year.is_closed) throw badRequest("Financial year is already closed");

    const incomeAccounts = await prisma.account.findMany({ where: { account_group: { type: "INCOME" } } });
    const expenseAccounts = await prisma.account.findMany({ where: { account_group: { type: "EXPENSE" } } });

    let totalIncome = 0;
    for (const acc of incomeAccounts) {
      const { balance } = await accountBalance(acc.id);
      totalIncome += -balance; // CREDIT_NORMAL: display balance is -balance
    }
    let totalExpense = 0;
    for (const acc of expenseAccounts) {
      const { balance } = await accountBalance(acc.id);
      totalExpense += balance; // DEBIT_NORMAL
    }
    const surplusOrDeficit = totalIncome - totalExpense;
    const surplusAccount = await prisma.account.findUniqueOrThrow({ where: { code: "3004" } });

    // Real closing-entry accounting: zero out every P&L account (never touch
    // balance-sheet accounts like Cash — surplus/deficit is a reclassification
    // of already-recorded transactions into equity, not a new cash movement).
    // Each income account is debited by its own balance (Cr Surplus/Deficit);
    // each expense account is credited by its own balance (Dr Surplus/Deficit)
    // — the many small lines net out to exactly totalIncome - totalExpense
    // on the Surplus/Deficit account.
    const closingLines: { debit_account_id?: string; credit_account_id?: string; amount: number }[] = [];
    for (const acc of incomeAccounts) {
      const { balance } = await accountBalance(acc.id);
      const accBalance = -balance;
      if (Math.abs(accBalance) > 0.01) closingLines.push({ debit_account_id: acc.id, credit_account_id: surplusAccount.id, amount: accBalance });
    }
    for (const acc of expenseAccounts) {
      const { balance } = await accountBalance(acc.id);
      if (Math.abs(balance) > 0.01) closingLines.push({ debit_account_id: surplusAccount.id, credit_account_id: acc.id, amount: balance });
    }

    await prisma.$transaction(async (tx) => {
      await tx.financialYear.update({ where: { id }, data: { is_closed: true, closed_at: new Date() } });
      if (closingLines.length > 0) {
        const voucherNo = `JV-CLOSE-${year.label}`;
        await tx.voucher.create({
          data: {
            voucher_no: voucherNo,
            voucher_type: "JOURNAL",
            financial_year_id: id,
            date: year.end_date,
            narration: `Year-end closing — ${year.label}: transfer ${surplusOrDeficit >= 0 ? "surplus" : "deficit"} of ৳${Math.abs(surplusOrDeficit)} to equity`,
            reference_type: "YEAR_CLOSE",
            total_amount: Math.abs(surplusOrDeficit),
            status: "POSTED",
            is_auto: true,
            approved_at: new Date(),
            journal_entries: { create: closingLines },
          },
        });
      }
    });

    res.json({ success: true, data: { total_income: totalIncome, total_expense: totalExpense, surplus_or_deficit: surplusOrDeficit } });
  }),
);

// ── Fee → Income Account Mapping (Settings) ──────────────────────

accountsRouter.get(
  "/fee-mapping",
  asyncHandler(async (_req, res) => {
    const mappings = await prisma.feeAccountMapping.findMany();
    const accounts = await prisma.account.findMany({ where: { id: { in: mappings.map((m) => m.account_id) } } });
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    res.json({ success: true, data: mappings.map((m) => ({ ...m, account: accountById.get(m.account_id) })) });
  }),
);

accountsRouter.put(
  "/fee-mapping",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = z.record(z.string(), z.string()).parse(req.body);
    await prisma.$transaction(
      Object.entries(body).map(([category, account_id]) =>
        prisma.feeAccountMapping.upsert({
          where: { category: category as never },
          update: { account_id },
          create: { category: category as never, account_id },
        }),
      ),
    );
    res.json({ success: true, message: "Fee account mapping saved" });
  }),
);
