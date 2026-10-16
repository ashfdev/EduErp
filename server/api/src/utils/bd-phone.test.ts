import { describe, expect, it } from "vitest";
import { normalizeBdPhone } from "./bd-phone";

describe("normalizeBdPhone", () => {
  it.each([
    ["01712345678", "01712345678"],
    ["1712345678", "01712345678"],
    [1712345678, "01712345678"],
    ["+8801712345678", "01712345678"],
    ["8801712345678", "01712345678"],
    ["017-1234-5678", "01712345678"],
    ["017 1234 5678", "01712345678"],
    ["০১৭১২৩৪৫৬৭৮", "01712345678"],
  ])("normalizes %s", (raw, expected) => {
    expect(normalizeBdPhone(raw)).toBe(expected);
  });

  it.each(["", "12345", "0171234567", "021234567890", "1.71E+09", "phone", null, undefined])("rejects %s", (raw) => {
    expect(normalizeBdPhone(raw)).toBeNull();
  });
});
