import bcrypt from "bcryptjs";
import type { Prisma, PrismaClient, UserRole } from "@education-erp/db";

type Tx = Prisma.TransactionClient | PrismaClient;

// Name+phone-derived temp password, replacing the earlier opaque random-hex
// scheme — a guardian/teacher/student who never memorized a random string
// can reconstruct this one from their own name and phone number. Still
// satisfies passwordSchema (min 8, lower+upper+digit) and is never the
// account's permanent password: must_change_password forces a real,
// self-chosen password on first login.
export function generateMemorablePassword(name: string, phone: string): string {
  const firstNameRaw = (name.trim().split(/\s+/)[0] ?? "").replace(/[^a-zA-Z]/g, "");
  const base = firstNameRaw.length > 0 ? firstNameRaw.charAt(0).toUpperCase() + firstNameRaw.slice(1).toLowerCase() : "User";
  const namePart = base.length >= 3 ? base : (base + "xyz").slice(0, 3);
  const digits = phone.replace(/\D/g, "").slice(-4).padStart(4, "0");
  return `${namePart}${digits}!1`;
}

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
  // password_override lets a direct, one-at-a-time admin flow (Staff
  // create, Settings->Users create, Reset Password) set an explicit
  // password instead of the auto-generated memorable one — the caller is
  // responsible for validating it against passwordSchema first.
  params: { role: UserRole; phone: string; name: string; password_override?: string },
): Promise<{ userId: string; tempPassword: string | null; created: boolean }> {
  const existing = await tx.user.findUnique({ where: { phone: params.phone } });
  if (existing) {
    return { userId: existing.id, tempPassword: null, created: false };
  }

  const tempPassword = params.password_override ?? generateMemorablePassword(params.name, params.phone);
  const password_hash = await bcrypt.hash(tempPassword, 10);
  const user = await tx.user.create({
    data: { name_en: params.name, role: params.role, phone: params.phone, password_hash, must_change_password: true },
  });
  return { userId: user.id, tempPassword, created: true };
}
