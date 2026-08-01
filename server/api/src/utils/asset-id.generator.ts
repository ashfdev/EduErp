import { prisma } from "../lib/prisma";
import { createWithUniqueBusinessNo, generateSequentialNo } from "./business-number.generator";

const ASSET_COUNT = (range: { gte: Date; lt: Date }) => prisma.asset.count({ where: { created_at: range } });
const ASSET_EXISTS = (candidate: string) => prisma.asset.findUnique({ where: { asset_uid: candidate } }).then((r) => r !== null);

// AST-{YEAR}-{sequential}. Thin wrapper over the shared generic generator —
// see business-number.generator.ts for why this is only a starting
// candidate, not a guarantee (that's createWithUniqueAssetUid() below).
export async function generateAssetUid(): Promise<string> {
  return generateSequentialNo("AST", new Date().getFullYear(), ASSET_COUNT, ASSET_EXISTS, 4);
}

// Generates a fresh asset_uid and calls `create`, retrying with a new UID if
// a concurrent request won the race for the same one.
export async function createWithUniqueAssetUid<T>(create: (assetUid: string) => Promise<T>): Promise<T> {
  return createWithUniqueBusinessNo("AST", new Date().getFullYear(), ASSET_COUNT, ASSET_EXISTS, "asset_uid", create, 4);
}
