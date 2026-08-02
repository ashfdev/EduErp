-- CreateEnum
CREATE TYPE "WaiverRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InAppNotificationType" ADD VALUE 'WAIVER_REQUESTED';
ALTER TYPE "InAppNotificationType" ADD VALUE 'WAIVER_APPROVED';
ALTER TYPE "InAppNotificationType" ADD VALUE 'WAIVER_REJECTED';

-- CreateTable
CREATE TABLE "WaiverRequest" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "WaiverRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "student_waiver_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaiverRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaiverRequest_student_waiver_id_key" ON "WaiverRequest"("student_waiver_id");

-- CreateIndex
CREATE INDEX "WaiverRequest_student_id_idx" ON "WaiverRequest"("student_id");

-- CreateIndex
CREATE INDEX "WaiverRequest_status_idx" ON "WaiverRequest"("status");

-- AddForeignKey
ALTER TABLE "WaiverRequest" ADD CONSTRAINT "WaiverRequest_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiverRequest" ADD CONSTRAINT "WaiverRequest_student_waiver_id_fkey" FOREIGN KEY ("student_waiver_id") REFERENCES "StudentWaiver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

