import { PrismaClient } from "@education-erp/db";

declare global {
  // eslint-disable-next-line no-var
  var __notificationServicePrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient = global.__notificationServicePrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__notificationServicePrisma = prisma;
}
