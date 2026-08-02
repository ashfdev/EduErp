import type { Invoice, Payment } from "@education-erp/db";

export type ApplicationPaymentStatus = "NOT_REQUIRED" | "DUE" | "PARTIAL" | "PENDING_VERIFICATION" | "PAID";

type InvoiceWithPayments = Pick<Invoice, "status" | "amount_paid"> & {
  payments: Pick<Payment, "status">[];
};

// Single source of truth for "has this applicant paid" -- reused by the
// apply response, the applications list, the single-application GET, the
// public status-check route, and the status-transition payment gate
// (Plan Twenty-Three, Phase 3), so these can never independently drift on
// what "paid" means.
//
// NOT_REQUIRED: the cycle has no app_fee/form_fee, so no invoice exists.
// DUE: at least one invoice is unpaid and no self-reported payment is
//   awaiting staff verification.
// PARTIAL: some (but not all) amount has been collected against the
//   invoices, with nothing currently awaiting verification.
// PENDING_VERIFICATION: a self-reported manual payment (or an
//   unconfirmed gateway attempt) is sitting as Payment(INITIATED) --
//   surfaced separately from a plain "not yet paid" so staff know it
//   needs a manual check, not a payment-due reminder.
// PAID: every linked invoice is PAID or WAIVED.
export function computeApplicationPaymentStatus(invoices: InvoiceWithPayments[]): ApplicationPaymentStatus {
  if (!invoices.length) return "NOT_REQUIRED";
  if (invoices.every((inv) => inv.status === "PAID" || inv.status === "WAIVED")) return "PAID";
  if (invoices.some((inv) => inv.payments.some((p) => p.status === "INITIATED"))) return "PENDING_VERIFICATION";
  if (invoices.some((inv) => inv.amount_paid > 0)) return "PARTIAL";
  return "DUE";
}
