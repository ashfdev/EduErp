import type { Invoice, Payment, PayrollRecord, Staff } from "@education-erp/db";
import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { createVoucher, type JournalEntryInput } from "./voucher-helpers";

// Every money movement elsewhere in the system MUST create a journal entry
// here — this is the one place that's allowed to happen. Never bypass this
// service from another module; never manually construct a Voucher elsewhere.
// All auto-journals post immediately (no DRAFT→APPROVED→POSTED workflow —
// that's for manually-entered vouchers only) since they're system-derived
// and already balanced by construction, not user input needing review.

async function getAccountId(code: string): Promise<string> {
  const account = await prisma.account.findUniqueOrThrow({ where: { code } });
  return account.id;
}

// appliedToInvoice defaults to the full payment amount (every existing
// caller's behavior, unchanged). Pass a smaller value when an advance-
// payment overpayment (Phase 81) has capped what actually applies to this
// invoice — the remainder is credited to the "Advance Fees Received" (2005)
// liability instead of the invoice's income account, since it hasn't been
// earned against any real invoice yet.
export async function createFeeReceiptJournal(payment: Payment, invoice: Invoice, appliedToInvoice?: number): Promise<void> {
  try {
    const applied = appliedToInvoice ?? payment.amount;
    const overflow = payment.amount - applied;

    const mapping = await prisma.feeAccountMapping.findUnique({ where: { category: invoice.category } });
    const incomeAccountId = mapping?.account_id ?? (await getAccountId("4011")); // Other Income fallback
    const cashOrBankAccountId = await getAccountId(payment.gateway === "CASH" ? "1001" : "1002");

    const entries: JournalEntryInput[] = [
      { debit_account_id: cashOrBankAccountId, amount: payment.amount, narration: `Fee receipt — ${invoice.description}` },
      { credit_account_id: incomeAccountId, amount: applied, narration: `Fee receipt — ${invoice.description}` },
    ];
    if (overflow > 0) {
      const advanceAccountId = await getAccountId("2005");
      entries.push({ credit_account_id: advanceAccountId, amount: overflow, narration: `Advance payment credited — ${invoice.description}` });
    }

    await createVoucher(prisma, {
      voucher_type: "RECEIPT",
      date: payment.paid_at ?? new Date(),
      narration: `Fee payment received for invoice ${invoice.id} (${invoice.category})`,
      reference_type: "FEE_PAYMENT",
      reference_id: payment.id,
      entries,
      is_auto: true,
      auto_post: true,
    });
  } catch (err) {
    logger.error({ err, paymentId: payment.id }, "auto-journal: failed to create fee receipt journal");
  }
}

// Reclassifies previously-banked advance credit into real income once it's
// actually applied against a specific new invoice (createMonthlyInvoiceIfMissing,
// Phase 81) — no new cash changes hands here, so this debits the liability
// (2005) it was originally credited to instead of Cash/Bank.
export async function createAdvanceCreditConsumptionJournal(payment: Payment, invoice: Invoice): Promise<void> {
  try {
    const mapping = await prisma.feeAccountMapping.findUnique({ where: { category: invoice.category } });
    const incomeAccountId = mapping?.account_id ?? (await getAccountId("4011"));
    const advanceAccountId = await getAccountId("2005");

    const entries: JournalEntryInput[] = [
      { debit_account_id: advanceAccountId, amount: payment.amount, narration: `Advance credit applied — ${invoice.description}` },
      { credit_account_id: incomeAccountId, amount: payment.amount, narration: `Advance credit applied — ${invoice.description}` },
    ];

    await createVoucher(prisma, {
      voucher_type: "RECEIPT",
      date: payment.paid_at ?? new Date(),
      narration: `Advance credit applied to invoice ${invoice.id} (${invoice.category})`,
      reference_type: "FEE_PAYMENT",
      reference_id: payment.id,
      entries,
      is_auto: true,
      auto_post: true,
    });
  } catch (err) {
    logger.error({ err, paymentId: payment.id }, "auto-journal: failed to create advance credit consumption journal");
  }
}

export async function createPayrollJournal(payrollRecord: PayrollRecord, staff: Staff): Promise<void> {
  try {
    const isTeaching = staff.designation.toLowerCase().includes("teach");
    const salaryExpenseAccountId = await getAccountId(isTeaching ? "5001" : "5002");
    const cashOrBankAccountId = await getAccountId("1002");
    const tdsPayableAccountId = await getAccountId("2002");

    // PayrollRecord.deductions is a single lump sum in this schema (no
    // separate PF/TDS breakdown tracked) — modeled here as a TDS Payable
    // liability rather than splitting it further, which would require
    // changing Phase 12's payroll schema.
    const entries: JournalEntryInput[] = [
      { debit_account_id: salaryExpenseAccountId, amount: payrollRecord.gross_salary, narration: `Salary expense — ${staff.name_en} (${payrollRecord.month}/${payrollRecord.year})` },
      { credit_account_id: cashOrBankAccountId, amount: payrollRecord.net_salary, narration: `Net salary paid — ${staff.name_en}` },
    ];
    if (payrollRecord.deductions > 0) {
      entries.push({ credit_account_id: tdsPayableAccountId, amount: payrollRecord.deductions, narration: `Payroll deductions — ${staff.name_en}` });
    }

    await createVoucher(prisma, {
      voucher_type: "PAYMENT",
      date: new Date(),
      narration: `Payroll paid — ${staff.name_en} (${payrollRecord.month}/${payrollRecord.year})`,
      reference_type: "PAYROLL",
      reference_id: payrollRecord.id,
      entries,
      is_auto: true,
      auto_post: true,
    });
  } catch (err) {
    logger.error({ err, payrollRecordId: payrollRecord.id }, "auto-journal: failed to create payroll journal");
  }
}

// Called on GRN receipt — creates a liability (Accounts Payable) for the
// goods received, whether they're consumable stock or fixed assets.
export async function createInventoryPurchaseJournal(params: {
  grnId: string;
  totalAmount: number;
  debitAccountId: string;
  narration: string;
}): Promise<string | null> {
  try {
    const accountsPayableId = await getAccountId("2001");
    const voucher = await createVoucher(prisma, {
      voucher_type: "JOURNAL",
      date: new Date(),
      narration: params.narration,
      reference_type: "INVENTORY_PURCHASE",
      reference_id: params.grnId,
      entries: [
        { debit_account_id: params.debitAccountId, amount: params.totalAmount, narration: params.narration },
        { credit_account_id: accountsPayableId, amount: params.totalAmount, narration: params.narration },
      ],
      is_auto: true,
      auto_post: true,
    });
    return voucher.id;
  } catch (err) {
    logger.error({ err, grnId: params.grnId }, "auto-journal: failed to create inventory purchase journal");
    return null;
  }
}

// Called from depreciation.service.ts — one consolidated voucher per
// depreciation run, with one journal-entry line per asset for audit detail.
export async function createDepreciationJournal(period: string, assetAmounts: { assetId: string; amount: number }[]): Promise<string | null> {
  try {
    const totalDep = assetAmounts.reduce((sum, a) => sum + a.amount, 0);
    if (totalDep <= 0) return null;

    const depExpenseAccountId = await getAccountId("5018");
    const accumulatedDepAccountId = await getAccountId("1105");

    const voucher = await createVoucher(prisma, {
      voucher_type: "JOURNAL",
      date: new Date(),
      narration: `Depreciation — ${period} (${assetAmounts.length} assets)`,
      reference_type: "DEPRECIATION",
      entries: [
        { debit_account_id: depExpenseAccountId, amount: totalDep, narration: `Depreciation expense — ${period}` },
        { credit_account_id: accumulatedDepAccountId, amount: totalDep, narration: `Accumulated depreciation — ${period}` },
      ],
      is_auto: true,
      auto_post: true,
    });
    return voucher.id;
  } catch (err) {
    logger.error({ err, period }, "auto-journal: failed to create depreciation journal");
    return null;
  }
}

export async function createAssetDisposalJournal(params: {
  assetId: string;
  assetAccountId: string;
  purchasePrice: number;
  accumulatedDep: number;
  disposedValue: number;
}): Promise<string | null> {
  try {
    const cashAccountId = await getAccountId("1001");
    const accumulatedDepAccountId = await getAccountId("1105");
    const lossAccountId = await getAccountId("5020");
    const bookValue = params.purchasePrice - params.accumulatedDep;
    const gainOrLoss = params.disposedValue - bookValue; // negative = loss

    const entries: JournalEntryInput[] = [
      { credit_account_id: params.assetAccountId, amount: params.purchasePrice, narration: "Removing asset at cost" },
      { debit_account_id: accumulatedDepAccountId, amount: params.accumulatedDep, narration: "Removing accumulated depreciation" },
    ];
    if (params.disposedValue > 0) {
      entries.push({ debit_account_id: cashAccountId, amount: params.disposedValue, narration: "Proceeds from disposal" });
    }
    if (gainOrLoss < 0) {
      entries.push({ debit_account_id: lossAccountId, amount: -gainOrLoss, narration: "Loss on disposal" });
    } else if (gainOrLoss > 0) {
      // A gain needs its own income line to keep the voucher balanced —
      // Other Income (4011) doubles as Gain on Disposal since the chart
      // doesn't have a dedicated line for it.
      const gainAccountId = await getAccountId("4011");
      entries.push({ credit_account_id: gainAccountId, amount: gainOrLoss, narration: "Gain on disposal" });
    }

    const voucher = await createVoucher(prisma, {
      voucher_type: "JOURNAL",
      date: new Date(),
      narration: `Asset disposal — ${params.assetId}`,
      reference_type: "ASSET_DISPOSAL",
      reference_id: params.assetId,
      entries,
      is_auto: true,
      auto_post: true,
    });
    return voucher.id;
  } catch (err) {
    logger.error({ err, assetId: params.assetId }, "auto-journal: failed to create asset disposal journal");
    return null;
  }
}

export async function createMaintenanceJournal(params: { assetId: string; cost: number }): Promise<string | null> {
  if (params.cost <= 0) return null;
  try {
    const repairsAccountId = await getAccountId("5011");
    const cashAccountId = await getAccountId("1001");
    const voucher = await createVoucher(prisma, {
      voucher_type: "PAYMENT",
      date: new Date(),
      narration: `Asset maintenance — ${params.assetId}`,
      reference_type: "ASSET_MAINTENANCE",
      reference_id: params.assetId,
      entries: [
        { debit_account_id: repairsAccountId, amount: params.cost, narration: "Repairs & maintenance" },
        { credit_account_id: cashAccountId, amount: params.cost, narration: "Repairs & maintenance" },
      ],
      is_auto: true,
      auto_post: true,
    });
    return voucher.id;
  } catch (err) {
    logger.error({ err, assetId: params.assetId }, "auto-journal: failed to create maintenance journal");
    return null;
  }
}
