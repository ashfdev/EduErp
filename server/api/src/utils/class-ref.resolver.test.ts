import { describe, expect, it } from "vitest";
import { resolveClassRef, resolveSectionRef, type ClassRef } from "./class-ref.resolver";

const class8: ClassRef = { id: "c8", name_en: "Class 8", name_bn: "অষ্টম শ্রেণি", numeric_level: 8, sections: [{ id: "s8a", name: "A" }, { id: "s8b", name: "B" }] };
const class9: ClassRef = { id: "c9", name_en: "Class 9", name_bn: null, numeric_level: 9, sections: [] };
const class10: ClassRef = { id: "c10", name_en: "Class 10", name_bn: null, numeric_level: 10, sections: [{ id: "s10s", name: "Science" }] };
const CLASSES = [class8, class9, class10];

describe("resolveClassRef", () => {
  it.each([
    ["c8", "c8"],
    ["Class 8", "c8"],
    ["class-8", "c8"],
    ["CLASS_8", "c8"],
    ["8", "c8"],
    ["Class-10", "c10"],
    ["অষ্টম শ্রেণি", "c8"],
    ["ক্লাস ৯", "c9"],
  ])("matches %s", (raw, id) => {
    expect(resolveClassRef(CLASSES, raw).match?.id).toBe(id);
  });

  it("does not confuse Class 1 with Class 10", () => {
    expect(resolveClassRef(CLASSES, "Class 1").error).toMatch(/not found/);
  });

  it("rejects a value matching several classes instead of guessing", () => {
    const twoNines: ClassRef[] = [
      { id: "sci", name_en: "Class 9 Science", name_bn: null, numeric_level: 9, sections: [] },
      { id: "arts", name_en: "Class 9 Arts", name_bn: null, numeric_level: 9, sections: [] },
    ];
    expect(resolveClassRef(twoNines, "9").error).toMatch(/more than one/);
  });

  it("explains a blank value and an empty academic year", () => {
    expect(resolveClassRef(CLASSES, "  ").error).toMatch(/required/);
    expect(resolveClassRef([], "Class 8").error).toMatch(/No classes are set up/);
  });

  it("lists the available classes when nothing matches", () => {
    expect(resolveClassRef(CLASSES, "Class 12").error).toContain("Class 8, Class 9, Class 10");
  });
});

describe("resolveSectionRef", () => {
  it("treats a blank section as none", () => {
    expect(resolveSectionRef(class8, "")).toEqual({ match: null });
    expect(resolveSectionRef(class8, undefined)).toEqual({ match: null });
  });

  it.each([
    ["s8a", "s8a"],
    ["A", "s8a"],
    ["b", "s8b"],
    ["Section B", "s8b"],
    ["section-a", "s8a"],
  ])("matches %s", (raw, id) => {
    expect(resolveSectionRef(class8, raw).match?.id).toBe(id);
  });

  it("rejects a section from a different class", () => {
    expect(resolveSectionRef(class8, "s10s").error).toMatch(/not found in Class 8 — available: A, B/);
  });

  it("tells the admin to leave it blank when the class has no sections", () => {
    expect(resolveSectionRef(class9, "A").error).toMatch(/no sections, leave it blank/);
  });
});
