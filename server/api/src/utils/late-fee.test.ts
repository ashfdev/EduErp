import { describe, expect, it } from "vitest";
import { calculateLateFee, daysOverdue } from "./late-fee";

const RULES = { late_fee_enabled: true, late_fee_type: "DAILY" as const, late_fee_amount: 10, late_fee_daily_cap: 100, grace_period_days: 5 };

describe("daysOverdue", () => {
  it("returns 0 within the grace period", () => {
    const dueDate = new Date("2026-01-01");
    const asOf = new Date("2026-01-05"); // 4 days after due, grace is 5
    expect(daysOverdue(dueDate, RULES, asOf)).toBe(0);
  });

  it("returns positive days once past the grace period", () => {
    const dueDate = new Date("2026-01-01");
    const asOf = new Date("2026-01-10"); // 9 days after due, 4 days past grace
    expect(daysOverdue(dueDate, RULES, asOf)).toBe(4);
  });
});

describe("calculateLateFee", () => {
  it("returns 0 when late fees are disabled", () => {
    expect(calculateLateFee(1000, new Date("2026-01-01"), { ...RULES, late_fee_enabled: false }, new Date("2026-02-01"))).toBe(0);
  });

  it("returns 0 within the grace period", () => {
    expect(calculateLateFee(1000, new Date("2026-01-01"), RULES, new Date("2026-01-03"))).toBe(0);
  });

  it("computes FIXED fine regardless of days overdue", () => {
    const rules = { ...RULES, late_fee_type: "FIXED" as const, late_fee_amount: 50 };
    expect(calculateLateFee(1000, new Date("2026-01-01"), rules, new Date("2026-01-20"))).toBe(50);
  });

  it("computes PERCENTAGE fine based on amount due", () => {
    const rules = { ...RULES, late_fee_type: "PERCENTAGE" as const, late_fee_amount: 5 };
    expect(calculateLateFee(1000, new Date("2026-01-01"), rules, new Date("2026-01-20"))).toBe(50);
  });

  it("computes DAILY fine multiplied by days overdue", () => {
    // due 2026-01-01, grace 5 days -> deadline 2026-01-06, asOf 2026-01-10 -> 4 days overdue
    expect(calculateLateFee(1000, new Date("2026-01-01"), RULES, new Date("2026-01-10"))).toBe(40);
  });

  it("clamps the fine at the daily cap", () => {
    const rules = { ...RULES, late_fee_daily_cap: 25 };
    expect(calculateLateFee(1000, new Date("2026-01-01"), rules, new Date("2026-01-10"))).toBe(25);
  });
});
