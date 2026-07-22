-- CreateEnum
CREATE TYPE "InvoiceGenerationTrigger" AS ENUM ('MANUAL', 'BULK_MONTHLY', 'PROMOTION', 'ADMISSION');

-- CreateTable
CREATE TABLE "InvoiceGenerationRun" (
    "id" TEXT NOT NULL,
    "run_by_id" TEXT NOT NULL,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger" "InvoiceGenerationTrigger" NOT NULL,
    "created_count" INTEGER NOT NULL,
    "skipped_count" INTEGER NOT NULL,
    "academic_year_id" TEXT,
    "month" INTEGER,
    "year" INTEGER,

    CONSTRAINT "InvoiceGenerationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceGenerationRun_run_at_idx" ON "InvoiceGenerationRun"("run_at");

