-- CreateEnum
CREATE TYPE "DocumentBatchJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InAppNotificationType" ADD VALUE 'DOCUMENT_BATCH_READY';
ALTER TYPE "InAppNotificationType" ADD VALUE 'DOCUMENT_BATCH_FAILED';

-- CreateTable
CREATE TABLE "DocumentBatchJob" (
    "id" TEXT NOT NULL,
    "job_kind" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "status" "DocumentBatchJobStatus" NOT NULL DEFAULT 'QUEUED',
    "file_blob_key" TEXT,
    "filename" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "DocumentBatchJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentBatchJob_requested_by_id_idx" ON "DocumentBatchJob"("requested_by_id");

