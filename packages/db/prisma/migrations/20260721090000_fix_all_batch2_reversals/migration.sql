-- AlterEnum
ALTER TYPE "InAppNotificationType" ADD VALUE 'JOURNAL_POST_FAILED';

-- AlterEnum
ALTER TYPE "PayrollStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Voucher" ADD COLUMN     "reversed_by_voucher_id" TEXT;

-- CreateTable
CREATE TABLE "JournalPostingFailure" (
    "id" TEXT NOT NULL,
    "reference_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "error_message" TEXT NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalPostingFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JournalPostingFailure_resolved_at_idx" ON "JournalPostingFailure"("resolved_at");

-- CreateIndex
CREATE INDEX "JournalPostingFailure_reference_type_reference_id_idx" ON "JournalPostingFailure"("reference_type", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_reversed_by_voucher_id_key" ON "Voucher"("reversed_by_voucher_id");

