import type { Prisma, PrismaClient, VoucherType } from "@education-erp/db";
import { badRequest } from "../../lib/errors";

type Tx = Prisma.TransactionClient | PrismaClient;

const VOUCHER_PREFIX: Record<VoucherType, string> = {
  RECEIPT: "RV",
  PAYMENT: "PV",
  JOURNAL: "JV",
  CONTRA: "CV",
  DEBIT_NOTE: "DN",
  CREDIT_NOTE: "CN",
};

// Same find-then-write sequence pattern used by student-id.generator.ts —
// not perfectly atomic under heavy concurrency, but voucher_no is @unique so
// a collision just means one more retry, never a duplicate.
export async function generateVoucherNo(tx: Tx, type: VoucherType, year: number): Promise<string> {
  const prefix = VOUCHER_PREFIX[type];
  const count = await tx.voucher.count({ where: { voucher_type: type, voucher_no: { startsWith: `${prefix}-${year}-` } } });
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `${prefix}-${year}-${String(count + 1 + attempt).padStart(4, "0")}`;
    const exists = await tx.voucher.findUnique({ where: { voucher_no: candidate } });
    if (!exists) return candidate;
  }
  throw new Error("Could not generate a unique voucher number after 10 attempts");
}

export interface JournalEntryInput {
  debit_account_id?: string | null;
  credit_account_id?: string | null;
  amount: number;
  narration?: string;
}

export interface CreateVoucherInput {
  voucher_type: VoucherType;
  date: Date;
  narration: string;
  narration_bn?: string;
  reference_no?: string;
  reference_type?: string;
  reference_id?: string;
  entries: JournalEntryInput[];
  created_by_id?: string; // absent for auto-journals with no human actor (e.g. payment gateway webhooks)
  is_auto?: boolean;
  auto_post?: boolean; // auto-journals post immediately, no approval step
}

// The one place double-entry balance is enforced (used by both the manual
// voucher form and every auto-journal caller) — total debit must equal
// total credit, or the whole system's trial balance silently drifts.
export function validateBalance(entries: JournalEntryInput[]): { totalDebit: number; totalCredit: number } {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const entry of entries) {
    if (!entry.debit_account_id && !entry.credit_account_id) {
      throw badRequest("Each journal entry line needs a debit or credit account");
    }
    if (entry.debit_account_id) totalDebit += entry.amount;
    if (entry.credit_account_id) totalCredit += entry.amount;
  }
  // Float accumulation can leave a fraction-of-a-poysha residue — round to
  // 2 decimal places (paisa) before comparing, not exact equality.
  const roundedDebit = Math.round(totalDebit * 100) / 100;
  const roundedCredit = Math.round(totalCredit * 100) / 100;
  if (roundedDebit !== roundedCredit) {
    throw badRequest(
      `Voucher is unbalanced. Debit: ৳${roundedDebit.toLocaleString()} Credit: ৳${roundedCredit.toLocaleString()} Difference: ৳${Math.abs(roundedDebit - roundedCredit).toLocaleString()}`,
    );
  }
  return { totalDebit: roundedDebit, totalCredit: roundedCredit };
}

export async function createVoucher(tx: Tx, input: CreateVoucherInput) {
  const { totalDebit } = validateBalance(input.entries);

  const activeFinancialYear = await tx.financialYear.findFirst({ where: { is_active: true } });
  if (!activeFinancialYear) throw badRequest("No active financial year is configured");
  if (activeFinancialYear.is_closed) throw badRequest("Financial year is closed");
  if (input.date < activeFinancialYear.start_date || input.date > activeFinancialYear.end_date) {
    throw badRequest("Voucher date is outside the active financial year's range");
  }

  const voucher_no = await generateVoucherNo(tx, input.voucher_type, input.date.getFullYear());

  const voucher = await tx.voucher.create({
    data: {
      voucher_no,
      voucher_type: input.voucher_type,
      financial_year_id: activeFinancialYear.id,
      date: input.date,
      narration: input.narration,
      narration_bn: input.narration_bn,
      reference_no: input.reference_no,
      reference_type: input.reference_type,
      reference_id: input.reference_id,
      total_amount: totalDebit,
      status: input.auto_post ? "POSTED" : "DRAFT",
      created_by_id: input.created_by_id,
      is_auto: input.is_auto ?? false,
      approved_by_id: input.auto_post ? input.created_by_id : undefined,
      approved_at: input.auto_post ? new Date() : undefined,
      journal_entries: {
        create: input.entries.map((e) => ({
          debit_account_id: e.debit_account_id ?? undefined,
          credit_account_id: e.credit_account_id ?? undefined,
          amount: e.amount,
          narration: e.narration,
        })),
      },
    },
    include: { journal_entries: true },
  });

  return voucher;
}
