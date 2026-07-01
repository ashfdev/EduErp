-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "installmentNumber" INTEGER,
ADD COLUMN     "lateFeeAccrued" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "parentInvoiceId" TEXT;
