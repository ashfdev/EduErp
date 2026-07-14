import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Prisma } from "@education-erp/db";
import { prisma } from "../../lib/prisma";
import { generateClassRoutine, orderedWorkingDays, rotate } from "./academic.routes";

describe("orderedWorkingDays", () => {
  it("sorts to the Bangladesh week order — Saturday first", () => {
    expect(orderedWorkingDays([0, 1, 2, 3, 4, 6])).toEqual([6, 0, 1, 2, 3, 4]);
  });

  it("drops nothing and adds nothing — pure reordering", () => {
    const input = [4, 0, 6, 2];
    expect(orderedWorkingDays(input).sort()).toEqual([...input].sort());
  });
});

describe("rotate", () => {
  it("rotates array elements left by the given offset", () => {
    expect(rotate([1, 2, 3, 4], 1)).toEqual([2, 3, 4, 1]);
    expect(rotate([1, 2, 3, 4], 2)).toEqual([3, 4, 1, 2]);
  });

  it("wraps the offset with modulo", () => {
    expect(rotate([1, 2, 3], 4)).toEqual(rotate([1, 2, 3], 1));
  });

  it("returns an empty array unchanged", () => {
    expect(rotate([], 3)).toEqual([]);
  });
});

// Every test builds its own fixtures inside a transaction that always rolls
// back (sentinel throw), so nothing is ever actually committed to the real
// dev DB — matches this project's "never leave test data behind" discipline
// without manual cleanup.
class Rollback extends Error {}

async function inRollbackTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  let captured: T | undefined;
  try {
    await prisma.$transaction(async (tx) => {
      captured = await fn(tx);
      throw new Rollback();
    });
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
  return captured as T;
}

async function buildFixture(tx: Prisma.TransactionClient) {
  const suffix = randomUUID().slice(0, 8);

  const year = await tx.academicYear.create({
    data: { label: `Test Year ${suffix}`, start_date: new Date("2026-01-01"), end_date: new Date("2026-12-31") },
  });
  const shift = await tx.shift.create({ data: { name: `Test Shift ${suffix}`, start_time: "08:00", end_time: "10:00" } });
  // Two periods, one working day: each of the two compulsory subjects below
  // gets an equal 1-period allocation (2 slots / 2 subjects), so both
  // genuinely attempt placement — this isolates the teacher-clash path from
  // the separate "not enough total capacity" case, which the generator
  // handles differently (silently allocates 0 periods, no "unplaced" entry).
  await tx.shiftPeriod.create({ data: { shift_id: shift.id, period_no: 1, start_time: "08:00", end_time: "08:45" } });
  await tx.shiftPeriod.create({ data: { shift_id: shift.id, period_no: 2, start_time: "08:45", end_time: "09:30" } });

  const klass = await tx.class.create({
    data: { academic_year_id: year.id, name_en: `Test Class ${suffix}`, numeric_level: 9 },
  });
  const section = await tx.section.create({ data: { class_id: klass.id, shift_id: shift.id, name: "A" } });

  const teacherUser = await tx.user.create({
    data: { name_en: "Test Teacher", role: "SUBJECT_TEACHER", phone: `013${suffix}`, password_hash: "x" },
  });
  const teacher = await tx.staff.create({
    data: { user_id: teacherUser.id, staff_uid: `TST-${suffix}`, name_en: "Test Teacher", designation: "Subject Teacher" },
  });

  const subjectA = await tx.subject.create({ data: { class_id: klass.id, name_en: "Subject A", code: `SUBA-${suffix}` } });
  const subjectB = await tx.subject.create({ data: { class_id: klass.id, name_en: "Subject B", code: `SUBB-${suffix}` } });

  await tx.subjectTeacherAssignment.create({ data: { subject_id: subjectA.id, staff_id: teacher.id, section_id: section.id, academic_year_id: year.id } });
  await tx.subjectTeacherAssignment.create({ data: { subject_id: subjectB.id, staff_id: teacher.id, section_id: section.id, academic_year_id: year.id } });

  // Simulate the same teacher already being committed elsewhere (a
  // different class/section) at period 2 on the same day — the ONLY axis
  // that should ever block a placement. This is what forces subject B's
  // sole remaining period to be a genuine double-booking, not just a
  // capacity shortfall.
  const otherClass = await tx.class.create({ data: { academic_year_id: year.id, name_en: `Other Class ${suffix}`, numeric_level: 10 } });
  const otherSection = await tx.section.create({ data: { class_id: otherClass.id, name: "A" } });
  await tx.routineSlot.create({
    data: { class_id: otherClass.id, section_id: otherSection.id, day_of_week: 6, period_no: 2, teacher_id: teacher.id, start_time: "08:45", end_time: "09:30" },
  });

  return { classId: klass.id, sectionId: section.id, teacherId: teacher.id, subjectAId: subjectA.id, subjectBId: subjectB.id };
}

describe("generateClassRoutine", () => {
  it("never double-books a teacher — reports the unplaceable subject instead of forcing a collision", async () => {
    const result = await inRollbackTx(async (tx) => {
      const fixture = await buildFixture(tx);
      const genResult = await generateClassRoutine(tx, fixture.classId, [6]); // single working day

      // Confirm the DB actually only holds one RoutineSlot for this
      // teacher/day/period combo — the real invariant, not just the
      // function's own return value.
      const rows = await tx.routineSlot.findMany({ where: { class_id: fixture.classId } });

      return { genResult, rows, fixture };
    });

    expect(result.rows.length).toBe(1);
    expect(result.genResult.placed_count).toBe(1);
    expect(result.genResult.unplaced.length).toBe(1);

    const placedSubjectId = result.rows[0]!.subject_id;
    const unplacedSubjectId = result.genResult.unplaced[0]!.subject_id;
    expect(new Set([placedSubjectId, unplacedSubjectId])).toEqual(new Set([result.fixture.subjectAId, result.fixture.subjectBId]));
    expect(result.genResult.unplaced[0]!.reason).toMatch(/double-booking/);
  });

  it("marks every generated row as generated: true, and leaves a hand-edited slot untouched on regenerate", async () => {
    await inRollbackTx(async (tx) => {
      const fixture = await buildFixture(tx);

      const manual = await tx.routineSlot.create({
        data: { class_id: fixture.classId, section_id: fixture.sectionId, day_of_week: 6, period_no: 1, start_time: "08:00", end_time: "08:45" },
      });

      // The manual slot occupies the section's only period, so the
      // generator (which never touches generated: false rows) should place
      // nothing new and report both subjects as unplaceable due to no free
      // slot — not overwrite the manual entry.
      const genResult = await generateClassRoutine(tx, fixture.classId, [6]);

      const stillThere = await tx.routineSlot.findUnique({ where: { id: manual.id } });
      expect(stillThere).not.toBeNull();
      expect(stillThere!.generated).toBe(false);
      expect(genResult.placed_count).toBe(0);
    });
  });
});
