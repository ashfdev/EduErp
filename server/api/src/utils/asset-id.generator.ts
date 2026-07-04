import { Prisma } from "@education-erp/db";
import { prisma } from "../lib/prisma";

// AST-{YEAR}-{sequential}. This is only a starting candidate — two
// concurrent requests can both pass this "not taken yet" check before
// either commits (classic check-then-insert race), so the real protection
// is createWithUniqueAssetUid() below, which retries the *insert* itself
// on a unique-constraint conflict rather than trusting this pre-check alone.
export async function generateAssetUid(): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const count = await prisma.asset.count({ where: { created_at: { gte: yearStart, lt: yearEnd } } });

  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `AST-${year}-${String(count + 1 + attempt).padStart(4, "0")}`;
    const exists = await prisma.asset.findUnique({ where: { asset_uid: candidate } });
    if (!exists) return candidate;
  }
  throw new Error("Could not generate a unique asset UID after 10 attempts");
}

function isUniqueConstraintError(err: unknown, field: string): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && (err.meta?.target as string[] | undefined)?.includes(field) === true;
}

// Generates a fresh asset_uid and calls `create`, retrying with a new UID if
// a concurrent request won the race for the same one — the actual fix for
// the TOCTOU gap in generateAssetUid()'s own pre-check.
export async function createWithUniqueAssetUid<T>(create: (assetUid: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const asset_uid = await generateAssetUid();
    try {
      return await create(asset_uid);
    } catch (err) {
      if (isUniqueConstraintError(err, "asset_uid") && attempt < 4) continue;
      throw err;
    }
  }
  throw new Error("Could not create asset with a unique UID after 5 attempts");
}
