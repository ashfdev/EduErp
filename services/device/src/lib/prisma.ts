import { PrismaClient } from "@education-erp/db";

declare global {
  // eslint-disable-next-line no-var
  var __deviceServicePrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient = global.__deviceServicePrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__deviceServicePrisma = prisma;
}
