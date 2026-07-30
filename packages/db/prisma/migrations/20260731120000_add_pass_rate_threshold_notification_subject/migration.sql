-- AlterTable
ALTER TABLE "AttendanceRules" ADD COLUMN     "pass_rate_alert_threshold" DOUBLE PRECISION NOT NULL DEFAULT 80;

-- AlterTable
ALTER TABLE "NotificationConfig" ADD COLUMN     "subject" TEXT;
