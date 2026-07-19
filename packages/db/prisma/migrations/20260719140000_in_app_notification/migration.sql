-- CreateEnum
CREATE TYPE "InAppNotificationType" AS ENUM ('COMPLAINT_FILED', 'COMPLAINT_REPLIED', 'COMPLAINT_REOPENED', 'DOCUMENT_REQUESTED', 'DOCUMENT_APPROVED', 'DOCUMENT_REJECTED', 'LEAVE_APPLIED', 'LEAVE_APPROVED', 'LEAVE_REJECTED', 'NOTICE_PUBLISHED', 'ROUTINE_UPDATED');

-- CreateTable
CREATE TABLE "InAppNotification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "InAppNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InAppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InAppNotification_user_id_is_read_idx" ON "InAppNotification"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "InAppNotification_user_id_created_at_idx" ON "InAppNotification"("user_id", "created_at");
