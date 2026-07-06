-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'BLANK_MARKSHEET';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "invoice_no" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "receipt_no" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoice_no_key" ON "Invoice"("invoice_no");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_receipt_no_key" ON "Payment"("receipt_no");

