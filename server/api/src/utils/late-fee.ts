export interface FeeRulesLike {
  late_fee_enabled: boolean;
  late_fee_type: "FIXED" | "PERCENTAGE" | "DAILY";
  late_fee_amount: number;
  late_fee_daily_cap: number;
  grace_period_days: number;
}

/** Days overdue past the grace period; 0 if not yet overdue. */
export function daysOverdue(dueDate: Date, rules: FeeRulesLike, asOf = new Date()): number {
  const graceDeadline = new Date(dueDate);
  graceDeadline.setDate(graceDeadline.getDate() + rules.grace_period_days);
  const diffMs = asOf.getTime() - graceDeadline.getTime();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function calculateLateFee(amountDue: number, dueDate: Date, rules: FeeRulesLike, asOf = new Date()): number {
  if (!rules.late_fee_enabled) return 0;
  const overdueDays = daysOverdue(dueDate, rules, asOf);
  if (overdueDays <= 0) return 0;

  let fine: number;
  switch (rules.late_fee_type) {
    case "FIXED":
      fine = rules.late_fee_amount;
      break;
    case "PERCENTAGE":
      fine = (amountDue * rules.late_fee_amount) / 100;
      break;
    case "DAILY":
      fine = rules.late_fee_amount * overdueDays;
      break;
  }

  return Math.min(fine, rules.late_fee_daily_cap);
}
