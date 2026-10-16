import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Prisma } from "@education-erp/db";
import { prisma } from "./prisma";
import { passwordSchema } from "@education-erp/validators";
import { createOrLinkPortalLogin, generateTempPassword } from "./portal-login";

// One capital, six lowercase, a hyphen, four digits, from the unambiguous sets.
const TEMP_PASSWORD_FORMAT = /^[A-HJ-NP-Z][a-hjkmnp-z]{6}-[2-9]{4}$/;

// Digit-only fake BD phone numbers, unique per test run.
function randomPhone(prefix: string): string {
  return prefix + Math.floor(10000000 + Math.random() * 89999999).toString();
}

// Every test runs inside a transaction that always rolls back (via a
// sentinel throw), so no fixture rows are ever actually committed —
// matches this project's "never leave test data behind" discipline
// without needing manual cleanup after every test.
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

describe("createOrLinkPortalLogin", () => {
  it("creates a new user with a random temp password when the phone is unused", async () => {
    const phone = randomPhone("017");
    const result = await inRollbackTx((tx) => createOrLinkPortalLogin(tx, { role: "STUDENT", phone, name: "Test Student" }));

    expect(result.created).toBe(true);
    expect(result.tempPassword).toMatch(TEMP_PASSWORD_FORMAT);
    expect(passwordSchema.safeParse(result.tempPassword).success).toBe(true);
    expect(result.userId).toBeTruthy();
  });

  it("does not derive the password from the person's name or phone number", async () => {
    const phone = randomPhone("018");
    const result = await inRollbackTx((tx) => createOrLinkPortalLogin(tx, { role: "GUARDIAN", phone, name: "Karim Guardian" }));
    expect(result.tempPassword).not.toBe(`Karim${phone.slice(-4)}!1`);
    expect(result.tempPassword).not.toContain("Karim");
  });

  it("uses an explicit password_override instead of generating one, when provided", async () => {
    const phone = randomPhone("013");
    const result = await inRollbackTx((tx) =>
      createOrLinkPortalLogin(tx, { role: "ACCOUNTANT", phone, name: "Override Case", password_override: "Chosen@1234" }),
    );
    expect(result.tempPassword).toBe("Chosen@1234");
  });

  it("links to an existing user by phone instead of creating a duplicate, and returns no password", async () => {
    const phone = randomPhone("016");

    await inRollbackTx(async (tx) => {
      const passwordHash = await bcrypt.hash("Existing@1234", 10);
      const existingUser = await tx.user.create({
        data: { name_en: "Existing Guardian", role: "GUARDIAN", phone, password_hash: passwordHash },
      });

      const result = await createOrLinkPortalLogin(tx, { role: "GUARDIAN", phone, name: "Same Guardian, Second Child" });

      expect(result.created).toBe(false);
      expect(result.tempPassword).toBeNull();
      expect(result.userId).toBe(existingUser.id);

      // Confirm no second User row was created for the same phone.
      const count = await tx.user.count({ where: { phone } });
      expect(count).toBe(1);
    });
  });

  it("refuses to link across an incompatible role instead of silently attaching to the wrong account", async () => {
    const phone = randomPhone("012");

    await inRollbackTx(async (tx) => {
      const passwordHash = await bcrypt.hash("Existing@1234", 10);
      const existingTeacher = await tx.user.create({
        data: { name_en: "Existing Teacher", role: "SUBJECT_TEACHER", phone, password_hash: passwordHash },
      });

      const result = await createOrLinkPortalLogin(tx, { role: "GUARDIAN", phone, name: "New Guardian" });

      expect(result.userId).toBeNull();
      expect(result.tempPassword).toBeNull();
      expect(result.created).toBe(false);
      expect(result.conflict).toEqual({ existingRole: "SUBJECT_TEACHER", existingName: "Existing Teacher" });

      // Confirm the pre-existing account was never mutated (still the
      // teacher it always was, not silently repurposed).
      const stillTeacher = await tx.user.findUniqueOrThrow({ where: { id: existingTeacher.id } });
      expect(stillTeacher.role).toBe("SUBJECT_TEACHER");
    });
  });

  it("never returns the same temp password twice across calls", async () => {
    const phone1 = randomPhone("015");
    const phone2 = randomPhone("014");

    const [r1, r2] = await inRollbackTx(async (tx) => {
      const a = await createOrLinkPortalLogin(tx, { role: "STUDENT", phone: phone1, name: "Student A" });
      const b = await createOrLinkPortalLogin(tx, { role: "STUDENT", phone: phone2, name: "Student B" });
      return [a, b] as const;
    });

    expect(r1.tempPassword).not.toBe(r2.tempPassword);
  });
});

describe("generateTempPassword", () => {
  it("always satisfies the password policy and avoids look-alike characters", () => {
    for (let i = 0; i < 500; i++) {
      const pw = generateTempPassword();
      expect(pw).toMatch(TEMP_PASSWORD_FORMAT);
      expect(passwordSchema.safeParse(pw).success).toBe(true);
    }
  });
});
