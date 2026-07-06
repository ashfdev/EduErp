import type { Prisma, PrismaClient } from "@education-erp/db";

type Tx = Prisma.TransactionClient | PrismaClient;

// Same find-then-write sequence pattern as accounts/voucher-helpers.ts's
// generateVoucherNo() — not perfectly atomic under heavy concurrency, but
// both columns are @unique so a collision just means one more retry, never
// a duplicate.
export async function generateInvoiceNo(tx: Tx, year = new Date().getFullYear()): Promise<string> {
  const prefix = "INV";
  const count = await tx.invoice.count({ where: { invoice_no: { startsWith: `${prefix}-${year}-` } } });
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `${prefix}-${year}-${String(count + 1 + attempt).padStart(5, "0")}`;
    const exists = await tx.invoice.findUnique({ where: { invoice_no: candidate } });
    if (!exists) return candidate;
  }
  throw new Error("Could not generate a unique invoice number after 10 attempts");
}

// Only ever called once a payment is confirmed COMPLETED — an INITIATED
// gateway attempt that later fails or is abandoned never gets a receipt_no.
export async function generateReceiptNo(tx: Tx, year = new Date().getFullYear()): Promise<string> {
  const prefix = "RCPT";
  const count = await tx.payment.count({ where: { receipt_no: { startsWith: `${prefix}-${year}-` } } });
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `${prefix}-${year}-${String(count + 1 + attempt).padStart(5, "0")}`;
    const exists = await tx.payment.findUnique({ where: { receipt_no: candidate } });
    if (!exists) return candidate;
  }
  throw new Error("Could not generate a unique receipt number after 10 attempts");
}
