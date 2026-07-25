import type { Prisma, PrismaClient, Invoice } from "@education-erp/db";
import { calculateLateFee, daysOverdue, type FeeRulesLike } from "../../utils/late-fee";

type Tx = Prisma.TransactionClient | PrismaClient;

// Finds the most-specific matching active FeeFineRule for this invoice
// (sub-category beats category-only, class-scoped beats all-classes) and
// computes the fine using it; falls back to the completely unmodified
// calculateLateFee() when no rule matches, guaranteeing byte-identical
// behavior for every invoice/category/class that never opts into the new
// engine (Plan Fourteen, Phase N2). Reuses the single institution-wide
// FeeRules.grace_period_days/late_fee_enabled/late_fee_daily_cap -- only
// the fine amount/type is overridable per rule.
export async function resolveFineForInvoice(
  tx: Tx,
  invoice: Pick<Invoice, "amount_due" | "due_date" | "category" | "fee_sub_category_id" | "academic_year_id">,
  studentClassId: string | null,
  rules: FeeRulesLike,
  asOf = new Date(),
): Promise<number> {
  if (!rules.late_fee_enabled) return 0;
  if (daysOverdue(invoice.due_date, rules, asOf) <= 0) return 0;

  const candidates = await tx.feeFineRule.findMany({
    where: {
      academic_year_id: invoice.academic_year_id,
      is_active: true,
      fee_category: invoice.category,
      OR: [{ fee_sub_category_id: null }, ...(invoice.fee_sub_category_id ? [{ fee_sub_category_id: invoice.fee_sub_category_id }] : [])],
    },
    include: { classes: { select: { class_id: true } } },
  });
  if (candidates.length === 0) return calculateLateFee(invoice.amount_due, invoice.due_date, rules, asOf);

  const applicable = candidates.filter((r) => {
    if (r.applicable_for === "ALL_CLASSES") return true;
    if (!studentClassId) return false;
    return r.classes.some((c) => c.class_id === studentClassId);
  });
  if (applicable.length === 0) return calculateLateFee(invoice.amount_due, invoice.due_date, rules, asOf);

  // Most specific wins: sub-category beats category-only, class-scoped
  // beats all-classes -- score each candidate and pick the highest.
  const winner = applicable
    .map((r) => ({ rule: r, score: (r.fee_sub_category_id ? 2 : 0) + (r.applicable_for === "SPECIFIC_CLASSES" ? 1 : 0) }))
    .sort((a, b) => b.score - a.score)[0]!.rule;

  const raw = winner.fine_value_type === "PERCENTAGE" ? invoice.amount_due * (winner.fine_value / 100) : winner.fine_value;
  return Math.min(raw, rules.late_fee_daily_cap);
}
