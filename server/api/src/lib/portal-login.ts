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
// already has an account (a returning guardian, a sibling's father) LINKS
// to the existing User instead of throwing — callers must branch on
// `created` rather than assuming a fresh password was always issued.
//
// Linking is only ever safe across a MATCHING role (two GUARDIAN accounts
// for siblings, a returning STUDENT). A phone that already belongs to a
// role-incompatible account (e.g. a staff member's phone reused as a new
// guardian's) must never be silently attached — that account's role means
// it can't even pass the portal's own role gate, so "linking" it would
// produce a guardian with no working access and no visible error anywhere.
// Real-world dual-identity (a teacher who is also a parent) isn't
// supported by this single-role User model at all and needs a human to
// resolve it, not a silent guess — so this returns a `conflict` descriptor
// instead of a userId, and never fabricates a fake success.
export async function createOrLinkPortalLogin(
  tx: Tx,
  // password_override lets a direct, one-at-a-time admin flow (Staff
  // create, Settings->Users create, Reset Password) set an explicit
  // password instead of the auto-generated memorable one — the caller is
  // responsible for validating it against passwordSchema first.
  params: { role: UserRole; phone: string; name: string; password_override?: string },
): Promise<{
  userId: string | null;
  tempPassword: string | null;
  created: boolean;
  conflict?: { existingRole: UserRole; existingName: string };
}> {
  const existing = await tx.user.findUnique({ where: { phone: params.phone } });
  if (existing) {
    if (existing.role !== params.role) {
      return { userId: null, tempPassword: null, created: false, conflict: { existingRole: existing.role, existingName: existing.name_en } };
    }
    return { userId: existing.id, tempPassword: null, created: false };
  }

  const tempPassword = params.password_override ?? generateMemorablePassword(params.name, params.phone);
  const password_hash = await bcrypt.hash(tempPassword, 10);
  const user = await tx.user.create({
    data: { name_en: params.name, role: params.role, phone: params.phone, password_hash, must_change_password: true },
  });
  return { userId: user.id, tempPassword, created: true };
}
