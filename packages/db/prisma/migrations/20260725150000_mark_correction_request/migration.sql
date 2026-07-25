-- CreateEnum
CREATE TYPE "MarkCorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "InAppNotificationType" ADD VALUE 'MARK_CORRECTION_REQUESTED';
ALTER TYPE "InAppNotificationType" ADD VALUE 'MARK_CORRECTION_APPROVED';
ALTER TYPE "InAppNotificationType" ADD VALUE 'MARK_CORRECTION_REJECTED';

-- CreateTable
CREATE TABLE "MarkCorrectionRequest" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "section_id" TEXT,
    "subject_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "MarkCorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "expires_at" TIMESTAMP(3),
    "revoked_by_id" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarkCorrectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarkCorrectionRequest_exam_id_subject_id_teacher_id_idx" ON "MarkCorrectionRequest"("exam_id", "subject_id", "teacher_id");

-- CreateIndex
CREATE INDEX "MarkCorrectionRequest_status_idx" ON "MarkCorrectionRequest"("status");
