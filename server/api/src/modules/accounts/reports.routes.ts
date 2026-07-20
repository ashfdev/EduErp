import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { ACCOUNTS_MANAGE_ROLES } from "../../lib/roles";
import { notFound } from "../../lib/errors";

export const accountsReportsRouter = Router();
// Every route in this file is a financial report (day-book, trial balance,
// balance sheet, etc.) — all 8 need the same gate, so applied once here
// rather than repeated per-route.
accountsReportsRouter.use(authenticate, authorize(ACCOUNTS_MANAGE_ROLES));

async function accountBalanceAsOf(accountId: string, asOfDate?: Date): Promise<{ debit: number; credit: number }> {
  const [debitAgg, creditAgg] = await Promise.all([
    prisma.journalEntry.aggregate({
      where: { debit_account_id: accountId, voucher: { status: "POSTED", ...(asOfDate && { date: { lte: asOfDate } }) } },
      _sum: { amount: true },
    }),
    prisma.journalEntry.aggregate({
      where: { credit_account_id: accountId, voucher: { status: "POSTED", ...(asOfDate && { date: { lte: asOfDate } }) } },
      _sum: { amount: true },
    }),
  ]);
  return { debit: debitAgg._sum.amount ?? 0, credit: creditAgg._sum.amount ?? 0 };
}

function closingBalance(account: { account_nature: string; opening_balance: number; opening_balance_type: string }, debit: number, credit: number): number {
  const opening = account.opening_balance_type === "DEBIT" ? account.opening_balance : -account.opening_balance;
  const movement = debit - credit;
  const raw = opening + movement;
  return account.account_nature === "DEBIT_NORMAL" ? raw : -raw;
}

accountsReportsRouter.get(
  "/day-book",
  asyncHandler(async (req, res) => {
    const query = z.object({ date: z.coerce.date(), voucher_type: z.string().optional() }).parse(req.query);
    const start = new Date(query.date.getFullYear(), query.date.getMonth(), query.date.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    const vouchers = await prisma.voucher.findMany({
      where: { status: "POSTED", date: { gte: start, lt: end }, ...(query.voucher_type && { voucher_type: query.voucher_type as never }) },
      include: { journal_entries: { include: { debit_account: true, credit_account: true } } },
      orderBy: { voucher_no: "asc" },
    });
    res.json({ success: true, data: vouchers });
  }),
);

accountsReportsRouter.get(
  "/cash-book",
  asyncHandler(async (req, res) => {
    const query = z.object({ from_date: z.coerce.date(), to_date: z.coerce.date() }).parse(req.query);
    const cashAccount = await prisma.account.findUnique({ where: { code: "1001" } });
    if (!cashAccount) throw notFound("Cash account (1001) not configured");
    res.redirect(307, `/api/accounts/ledger/${cashAccount.id}?from_date=${query.from_date.toISOString()}&to_date=${query.to_date.toISOString()}`);
  }),
);

accountsReportsRouter.get(
  "/bank-book",
  asyncHandler(async (req, res) => {
    const query = z.object({ from_date: z.coerce.date(), to_date: z.coerce.date(), bank_account_id: z.string().optional() }).parse(req.query);
    const account = query.bank_account_id
      ? await prisma.account.findUnique({ where: { id: query.bank_account_id } })
      : await prisma.account.findUnique({ where: { code: "1002" } });
    if (!account) throw notFound("Bank account not found");
    res.redirect(307, `/api/accounts/ledger/${account.id}?from_date=${query.from_date.toISOString()}&to_date=${query.to_date.toISOString()}`);
  }),
);

accountsReportsRouter.get(
  "/trial-balance",
  asyncHandler(async (req, res) => {
    const query = z.object({ financial_year_id: z.string().optional(), as_of_date: z.coerce.date().optional() }).parse(req.query);
    const groups = await prisma.accountGroup.findMany({
      orderBy: { display_order: "asc" },
      include: { accounts: { where: { is_active: true }, orderBy: { code: "asc" } } },
    });

    let totalDebit = 0;
    let totalCredit = 0;
    const groupRows = [];
    for (const group of groups) {
      const accountRows = [];
      for (const account of group.accounts) {
        const { debit, credit } = await accountBalanceAsOf(account.id, query.as_of_date);
        const closing = closingBalance(account, debit, credit);
        if (closing === 0 && account.opening_balance === 0) continue;
        // closingBalance() returns positive for a "natural-direction" balance
        // (DR for a debit-normal account, CR for credit-normal) and negative
        // for an abnormal one — a trial balance must show whichever side the
        // balance actually sits on, not assume every account behaves normally.
        const isNaturalDirection = closing >= 0 === (account.account_nature === "DEBIT_NORMAL");
        const debitCol = isNaturalDirection ? Math.abs(closing) : 0;
        const creditCol = isNaturalDirection ? 0 : Math.abs(closing);
        totalDebit += debitCol;
        totalCredit += creditCol;
        accountRows.push({ code: account.code, name: account.name, debit: debitCol, credit: creditCol });
      }
      groupRows.push({ group: group.name, accounts: accountRows });
    }

    res.json({
      success: true,
      data: {
        groups: groupRows,
        total_debit: Math.round(totalDebit * 100) / 100,
        total_credit: Math.round(totalCredit * 100) / 100,
        is_balanced: Math.abs(totalDebit - totalCredit) < 0.01,
      },
    });
  }),
);

accountsReportsRouter.get(
  "/income-expenditure",
  asyncHandler(async (req, res) => {
    const query = z.object({ financial_year_id: z.string().optional(), from_date: z.coerce.date().optional(), to_date: z.coerce.date().optional() }).parse(req.query);

    async function sectionTotal(accountType: "INCOME" | "EXPENSE") {
      const accounts = await prisma.account.findMany({ where: { account_group: { type: accountType }, is_active: true }, orderBy: { code: "asc" } });
      const rows = [];
      let total = 0;
      for (const account of accounts) {
        const [debitAgg, creditAgg] = await Promise.all([
          prisma.journalEntry.aggregate({
            where: { debit_account_id: account.id, voucher: { status: "POSTED", ...((query.from_date || query.to_date) && { date: { ...(query.from_date && { gte: query.from_date }), ...(query.to_date && { lte: query.to_date }) } }) } },
            _sum: { amount: true },
          }),
          prisma.journalEntry.aggregate({
            where: { credit_account_id: account.id, voucher: { status: "POSTED", ...((query.from_date || query.to_date) && { date: { ...(query.from_date && { gte: query.from_date }), ...(query.to_date && { lte: query.to_date }) } }) } },
            _sum: { amount: true },
          }),
        ]);
        const debit = debitAgg._sum.amount ?? 0;
        const credit = creditAgg._sum.amount ?? 0;
        const amount = accountType === "INCOME" ? credit - debit : debit - credit;
        if (amount === 0) continue;
        total += amount;
        rows.push({ code: account.code, name: account.name, amount });
      }
      return { rows, total };
    }

    const income = await sectionTotal("INCOME");
    const expenditure = await sectionTotal("EXPENSE");

    res.json({
      success: true,
      data: {
        income: income.rows,
        income_total: Math.round(income.total * 100) / 100,
        expenditure: expenditure.rows,
        expenditure_total: Math.round(expenditure.total * 100) / 100,
        surplus_or_deficit: Math.round((income.total - expenditure.total) * 100) / 100,
      },
    });
  }),
);

accountsReportsRouter.get(
  "/balance-sheet",
  asyncHandler(async (req, res) => {
    const query = z.object({ financial_year_id: z.string().optional(), as_of_date: z.coerce.date().optional() }).parse(req.query);

    // A contra account (e.g. 1105 Accumulated Depreciation — CREDIT_NORMAL,
    // grouped under ASSET) shows a positive balance in its own natural
    // direction, but that balance must be SUBTRACTED from the section total
    // (it reduces net assets), never added, or the balance sheet overstates
    // assets by 2x the contra balance.
    const EXPECTED_NATURE: Record<string, "DEBIT_NORMAL" | "CREDIT_NORMAL"> = {
      ASSET: "DEBIT_NORMAL",
      LIABILITY: "CREDIT_NORMAL",
      EQUITY: "CREDIT_NORMAL",
    };

    async function sectionRows(types: ("ASSET" | "LIABILITY" | "EQUITY")[]) {
      const accounts = await prisma.account.findMany({ where: { account_group: { type: { in: types } }, is_active: true }, include: { account_group: true }, orderBy: { code: "asc" } });
      const rows = [];
      let total = 0;
      for (const account of accounts) {
        const { debit, credit } = await accountBalanceAsOf(account.id, query.as_of_date);
        const balance = closingBalance(account, debit, credit);
        if (balance === 0 && account.opening_balance === 0) continue;
        const isContra = account.account_nature !== EXPECTED_NATURE[account.account_group.type];
        total += isContra ? -balance : balance;
        rows.push({ code: account.code, name: account.name, balance: Math.round(balance * 100) / 100, is_contra: isContra });
      }
      return { rows, total: Math.round(total * 100) / 100 };
    }

    const assets = await sectionRows(["ASSET"]);
    const liabilities = await sectionRows(["LIABILITY"]);
    const equity = await sectionRows(["EQUITY"]);

    // A balance sheet only balances mid-year if it accounts for the current
    // period's not-yet-closed net income — real accounting always folds
    // running Income - Expense into equity as an implicit "Current Year
    // Earnings" line (the formal FinancialYear "close" action later moves
    // this into the Surplus/Deficit account permanently; until then, this
    // report computes the same number on the fly so Assets = Liabilities +
    // Equity holds at any point in time, not just right after a year-end close).
    async function currentPeriodNetIncome(): Promise<number> {
      const [incomeAccounts, expenseAccounts] = await Promise.all([
        prisma.account.findMany({ where: { account_group: { type: "INCOME" } } }),
        prisma.account.findMany({ where: { account_group: { type: "EXPENSE" } } }),
      ]);
      let net = 0;
      for (const acc of incomeAccounts) {
        const { debit, credit } = await accountBalanceAsOf(acc.id, query.as_of_date);
        net += credit - debit;
      }
      for (const acc of expenseAccounts) {
        const { debit, credit } = await accountBalanceAsOf(acc.id, query.as_of_date);
        net -= debit - credit;
      }
      return Math.round(net * 100) / 100;
    }

    const currentYearEarnings = await currentPeriodNetIncome();
    const equityRows = currentYearEarnings !== 0 ? [...equity.rows, { code: "—", name: "Current Year Earnings (unclosed)", balance: currentYearEarnings }] : equity.rows;
    const totalEquity = Math.round((equity.total + currentYearEarnings) * 100) / 100;

    res.json({
      success: true,
      data: {
        assets: assets.rows,
        total_assets: assets.total,
        liabilities: liabilities.rows,
        total_liabilities: liabilities.total,
        equity: equityRows,
        total_equity: totalEquity,
        total_liabilities_and_equity: Math.round((liabilities.total + totalEquity) * 100) / 100,
        is_balanced: Math.abs(assets.total - (liabilities.total + totalEquity)) < 0.01,
      },
    });
  }),
);

accountsReportsRouter.get(
  "/account-summary",
  asyncHandler(async (req, res) => {
    const accounts = await prisma.account.findMany({ where: { is_active: true }, include: { account_group: true }, orderBy: { code: "asc" } });
    const rows = [];
    for (const account of accounts) {
      const { debit, credit } = await accountBalanceAsOf(account.id);
      const opening = account.opening_balance_type === "DEBIT" ? account.opening_balance : -account.opening_balance;
      rows.push({
        code: account.code,
        name: account.name,
        group: account.account_group.name,
        opening_balance: opening,
        total_debit: debit,
        total_credit: credit,
        closing_balance: closingBalance(account, debit, credit),
      });
    }
    res.json({ success: true, data: rows });
  }),
);

accountsReportsRouter.get(
  "/budget-vs-actual",
  asyncHandler(async (req, res) => {
    const query = z.object({ budget_id: z.string().min(1) }).parse(req.query);
    const budget = await prisma.budget.findUnique({ where: { id: query.budget_id }, include: { lines: { include: { account: true } } } });
    if (!budget) throw notFound("Budget not found");

    const rows = [];
    for (const line of budget.lines) {
      const { debit, credit } = await accountBalanceAsOf(line.account_id);
      const actual = line.account.account_nature === "DEBIT_NORMAL" ? debit - credit : credit - debit;
      const variance = line.amount - actual;
      const percentUsed = line.amount > 0 ? Math.round((actual / line.amount) * 1000) / 10 : 0;
      rows.push({ code: line.account.code, name: line.account.name, budgeted: line.amount, actual, variance, percent_used: percentUsed, over_budget: actual > line.amount });
    }
    res.json({ success: true, data: { budget: { id: budget.id, name: budget.name, status: budget.status }, rows } });
  }),
);
