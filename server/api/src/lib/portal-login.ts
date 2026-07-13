import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma, PrismaClient, UserRole } from "@education-erp/db";

type Tx = Prisma.TransactionClient | PrismaClient;

const ROLE_PREFIX: Partial<Record<UserRole, string>> = {
  STUDENT: "Stu",
  GUARDIAN: "Grd",
};

// Single shared entry point for "give this phone number a portal login" —
// used by staff creation, admin Settings->Users, admission enrollment, and
// manual/bulk student add, replacing four previously-separate ad-hoc
// tempPassword blocks. User.phone is globally unique, so a phone that
// already has an account (a returning guardian, a sibling's father, a
// staff/guardian phone overlap) LINKS to the existing User instead of
// throwing — callers must branch on `created` rather than assuming a fresh
// password was always issued.
export async function createOrLinkPortalLogin(
  tx: Tx,
  params: { role: UserRole; phone: string; name: string },
): Promise<{ userId: string; tempPassword: string | null; created: boolean }> {
  const existing = await tx.user.findUnique({ where: { phone: params.phone } });
  if (existing) {
    return { userId: existing.id, tempPassword: null, created: false };
  }

  const prefix = ROLE_PREFIX[params.role] ?? "Stf";
  const tempPassword = `${prefix}${randomBytes(4).toString("hex")}!1`;
  const password_hash = await bcrypt.hash(tempPassword, 10);
  const user = await tx.user.create({ data: { name_en: params.name, role: params.role, phone: params.phone, password_hash } });
  return { userId: user.id, tempPassword, created: true };
}
