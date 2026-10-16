import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma, PrismaClient, UserRole } from "@education-erp/db";

type Tx = Prisma.TransactionClient | PrismaClient;

// Characters that can't be confused when read off an SMS or a printed slip
// (no 0/O/o, 1/l/I).
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const DIGITS = "23456789";

function pick(chars: string, count: number): string {
  let out = "";
  for (let i = 0; i < count; i++) out += chars[randomInt(chars.length)];
  return out;
}

// Random temporary password such as "Kmtrqa-4827": one capital, six
// lowercase letters, a hyphen and four digits (about 44 bits). It replaced a
// name + last-4-phone-digits scheme that anyone who knew a guardian's or
// teacher's phone number could reproduce. Satisfies passwordSchema, and
// must_change_password forces a self-chosen password on first login.
export function generateTempPassword(): string {
  return `${pick(UPPER, 1)}${pick(LOWER, 6)}-${pick(DIGITS, 4)}`;
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
  // password instead of the auto-generated temporary one — the caller is
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

  const tempPassword = params.password_override ?? generateTempPassword();
  // Cost factor 12 (security audit, 2026-08-09: bumped from 10, below
  // current OWASP-recommended minimum).
  const password_hash = await bcrypt.hash(tempPassword, 12);
  const user = await tx.user.create({
    data: { name_en: params.name, role: params.role, phone: params.phone, password_hash, must_change_password: true },
  });
  return { userId: user.id, tempPassword, created: true };
}
