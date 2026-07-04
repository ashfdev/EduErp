import { z } from "zod";

export const accountSchema = z.object({
  account_group_id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  name_bn: z.string().optional(),
  account_nature: z.enum(["DEBIT_NORMAL", "CREDIT_NORMAL"]),
  is_bank_account: z.boolean().default(false),
  is_cash_account: z.boolean().default(false),
  opening_balance: z.number().default(0),
  opening_balance_type: z.enum(["DEBIT", "CREDIT"]).default("DEBIT"),
});

export const financialYearSchema = z.object({
  label: z.string().min(1),
  start_date: z.coerce.date(),
  end_date: z.coerce.date(),
});

export const journalEntryLineSchema = z
  .object({
    debit_account_id: z.string().optional().nullable(),
    credit_account_id: z.string().optional().nullable(),
    amount: z.number().positive(),
    narration: z.string().optional(),
  })
  .refine((e) => e.debit_account_id || e.credit_account_id, { message: "Each entry needs a debit or credit account" });

export const voucherSchema = z.object({
  voucher_type: z.enum(["RECEIPT", "PAYMENT", "JOURNAL", "CONTRA", "DEBIT_NOTE", "CREDIT_NOTE"]),
  date: z.coerce.date(),
  narration: z.string().min(1),
  narration_bn: z.string().optional(),
  reference_no: z.string().optional(),
  entries: z.array(journalEntryLineSchema).min(1),
});

export const bankAccountSchema = z.object({
  account_id: z.string().min(1),
  bank_name: z.string().min(1),
  branch_name: z.string().optional(),
  account_number: z.string().min(1),
  account_title: z.string().min(1),
});

export const chequeSchema = z.object({
  bank_account_id: z.string().min(1),
  voucher_id: z.string().optional(),
  cheque_no: z.string().min(1),
  cheque_date: z.coerce.date(),
  payee: z.string().min(1),
  amount: z.number().positive(),
  cheque_type: z.enum(["ISSUED", "RECEIVED"]),
});

export const budgetSchema = z.object({
  financial_year_id: z.string().min(1),
  name: z.string().min(1),
  lines: z.array(z.object({ account_id: z.string().min(1), amount: z.number().min(0), notes: z.string().optional() })).optional(),
});
