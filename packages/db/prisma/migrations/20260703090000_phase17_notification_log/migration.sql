-- CreateEnum
CREATE TYPE "NotifLogStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "trigger" "NotificationTrigger",
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "person_id" TEXT,
    "status" "NotifLogStatus" NOT NULL DEFAULT 'QUEUED',
    "message" TEXT,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationLog_trigger_idx" ON "NotificationLog"("trigger");

-- CreateIndex
CREATE INDEX "NotificationLog_channel_status_idx" ON "NotificationLog"("channel", "status");

-- CreateIndex
CREATE INDEX "NotificationLog_created_at_idx" ON "NotificationLog"("created_at");

