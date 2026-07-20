-- AlterEnum
ALTER TYPE "HistoryStatus" ADD VALUE 'EXPELLED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InAppNotificationType" ADD VALUE 'FEE_DUE';
ALTER TYPE "InAppNotificationType" ADD VALUE 'RESULT_PUBLISHED';
ALTER TYPE "InAppNotificationType" ADD VALUE 'EXAM_SCHEDULED';

-- AlterEnum
ALTER TYPE "NotificationTrigger" ADD VALUE 'EXAM_SCHEDULED';

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "reminder_sent_at" TIMESTAMP(3);

