import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import type { Prisma } from "@education-erp/db";
import { prisma } from "./prisma";
import { createOrLinkPortalLogin } from "./portal-login";

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
  it("creates a new user with a temp password when the phone is unused", async () => {
    const phone = `017${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const result = await inRollbackTx((tx) => createOrLinkPortalLogin(tx, { role: "STUDENT", phone, name: "Test Student" }));

    expect(result.created).toBe(true);
    expect(result.tempPassword).not.toBeNull();
    expect(result.tempPassword).toMatch(/^Stu[0-9a-f]{8}!1$/);
    expect(result.userId).toBeTruthy();
  });

  it("prefixes the temp password by role", async () => {
    const phone = `018${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const result = await inRollbackTx((tx) => createOrLinkPortalLogin(tx, { role: "GUARDIAN", phone, name: "Test Guardian" }));
    expect(result.tempPassword).toMatch(/^Grd/);
  });

  it("falls back to a generic prefix for roles with no dedicated one", async () => {
    const phone = `019${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const result = await inRollbackTx((tx) => createOrLinkPortalLogin(tx, { role: "CLASS_TEACHER", phone, name: "Test Teacher" }));
    expect(result.tempPassword).toMatch(/^Stf/);
  });

  it("links to an existing user by phone instead of creating a duplicate, and returns no password", async () => {
    const phone = `016${randomUUID().replace(/-/g, "").slice(0, 8)}`;

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

  it("never returns the same temp password twice across calls", async () => {
    const phone1 = `015${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const phone2 = `014${randomUUID().replace(/-/g, "").slice(0, 8)}`;

    const [r1, r2] = await inRollbackTx(async (tx) => {
      const a = await createOrLinkPortalLogin(tx, { role: "STUDENT", phone: phone1, name: "Student A" });
      const b = await createOrLinkPortalLogin(tx, { role: "STUDENT", phone: phone2, name: "Student B" });
      return [a, b] as const;
    });

    expect(r1.tempPassword).not.toBe(r2.tempPassword);
  });
});
