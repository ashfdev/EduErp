import type { Prisma, PrismaClient } from "@education-erp/db";
import { generateSequentialNo } from "../../utils/business-number.generator";

type Tx = Prisma.TransactionClient | PrismaClient;

// Only ever a starting candidate -- both columns are @unique, so a
// concurrent collision on this pre-check surfaces as a P2002 from the
// eventual create() call. Callers that create inside their own transaction
// (invoice/payment creation both already run inside a $transaction) rely on
// that transaction's own retry-or-fail handling rather than a built-in
// retry loop here — see invoice-helpers.ts's createMonthlyInvoiceIfMissing
// for the one caller that explicitly retries on a P2002 collision.
export async function generateInvoiceNo(tx: Tx, year = new Date().getFullYear()): Promise<string> {
  return generateSequentialNo(
    "INV",
    year,
    () => tx.invoice.count({ where: { invoice_no: { startsWith: `INV-${year}-` } } }),
    (candidate) => tx.invoice.findUnique({ where: { invoice_no: candidate } }).then((r) => r !== null),
    5,
  );
}

// Only ever called once a payment is confirmed COMPLETED — an INITIATED
// gateway attempt that later fails or is abandoned never gets a receipt_no.
export async function generateReceiptNo(tx: Tx, year = new Date().getFullYear()): Promise<string> {
  return generateSequentialNo(
    "RCPT",
    year,
    () => tx.payment.count({ where: { receipt_no: { startsWith: `RCPT-${year}-` } } }),
    (candidate) => tx.payment.findUnique({ where: { receipt_no: candidate } }).then((r) => r !== null),
    5,
  );
}
