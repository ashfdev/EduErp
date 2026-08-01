import { Prisma } from "@education-erp/db";

// Shared with other business-number generators (e.g. invoice-helpers.ts's
// monthly-invoice idempotency check) that need to detect "a concurrent
// request already won this exact row" without duplicating this check.
export function isUniqueConstraintError(err: unknown, field: string): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && (err.meta?.target as string[] | undefined)?.includes(field) === true;
}

// Generic {prefix}-{year}-{sequential} candidate generator, parameterized
// over which model to count/probe against (count/exists are both
// caller-supplied so this works identically whether the caller is using the
// global prisma client or a transaction's tx client). This is only a
// starting candidate -- two concurrent requests can both pass the "not
// taken yet" probe before either commits (classic check-then-insert race),
// so the real protection is createWithUniqueBusinessNo() below, which
// retries the *insert* itself on a unique-constraint conflict rather than
// trusting this pre-check alone.
export async function generateSequentialNo(
  prefix: string,
  year: number,
  count: (range: { gte: Date; lt: Date }) => Promise<number>,
  exists: (candidate: string) => Promise<boolean>,
  padWidth: number,
): Promise<string> {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const baseCount = await count({ gte: yearStart, lt: yearEnd });

  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `${prefix}-${year}-${String(baseCount + 1 + attempt).padStart(padWidth, "0")}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(`Could not generate a unique ${prefix} number after 10 attempts`);
}

// Generates a fresh business number and calls create(), retrying with a
// freshly-generated number if a concurrent request won the race for the one
// just generated — the actual fix for generateSequentialNo()'s own TOCTOU
// pre-check gap. uniqueField must match the DB column name P2002's
// err.meta.target will report for the relevant unique constraint.
export async function createWithUniqueBusinessNo<T>(
  prefix: string,
  year: number,
  count: (range: { gte: Date; lt: Date }) => Promise<number>,
  exists: (candidate: string) => Promise<boolean>,
  uniqueField: string,
  create: (no: string) => Promise<T>,
  padWidth = 4,
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const no = await generateSequentialNo(prefix, year, count, exists, padWidth);
    try {
      return await create(no);
    } catch (err) {
      if (isUniqueConstraintError(err, uniqueField) && attempt < 4) continue;
      throw err;
    }
  }
  throw new Error(`Could not create with a unique ${prefix} number after 5 attempts`);
}
