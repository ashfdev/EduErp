import { describe, expect, it } from "vitest";
import { computeOvertime } from "./overtime";

describe("computeOvertime", () => {
  it("returns 0 when any input is missing", () => {
    expect(computeOvertime(null, "09:00", "17:00")).toBe(0);
    expect(computeOvertime(new Date("2026-01-05T17:30:00"), undefined, "17:00")).toBe(0);
    expect(computeOvertime(new Date("2026-01-05T17:30:00"), "09:00", undefined)).toBe(0);
  });

  it("computes overtime correctly for a normal same-day checkout", () => {
    // Day shift 09:00-17:00, checked out 17:30 the same day -> 0.5h overtime.
    const checkOut = new Date("2026-01-05T17:30:00");
    expect(computeOvertime(checkOut, "09:00", "17:00")).toBe(0.5);
  });

  it("returns 0 for a same-day checkout with no overtime", () => {
    const checkOut = new Date("2026-01-05T16:45:00");
    expect(computeOvertime(checkOut, "09:00", "17:00")).toBe(0);
  });

  it("computes overtime correctly for a genuine overnight shift", () => {
    // Overnight shift 22:00-06:00, checked out 06:30 the next calendar day
    // -> shiftEnd naturally lands on checkOut's own date -> 0.5h overtime.
    const checkOut = new Date("2026-01-06T06:30:00");
    expect(computeOvertime(checkOut, "22:00", "06:00")).toBe(0.5);
  });

  it("computes overtime correctly for a normal day shift whose checkout spills past midnight (the fixed bug)", () => {
    // Day shift 09:00-17:00, but checked out 01:00 the following calendar
    // day (worked very late). shiftEnd must be anchored to the PREVIOUS
    // day's 17:00, not "today" 17:00 (which would be in the future
    // relative to a 01:00 checkout and silently produce 0).
    const checkOut = new Date("2026-01-06T01:00:00");
    expect(computeOvertime(checkOut, "09:00", "17:00")).toBe(8);
  });
});
