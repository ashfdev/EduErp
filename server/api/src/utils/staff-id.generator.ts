import { prisma } from "../lib/prisma";

// No dedicated StaffIdConfig settings table exists (unlike students' fully
// configurable StudentIdConfig) — the spec's format is fixed:
// STAFF-{YEAR}-{sequential}, sequential resets per calendar year.
export async function generateStaffUid(): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const count = await prisma.staff.count({ where: { created_at: { gte: yearStart, lt: yearEnd } } });
  return `STAFF-${year}-${String(count + 1).padStart(4, "0")}`;
}
