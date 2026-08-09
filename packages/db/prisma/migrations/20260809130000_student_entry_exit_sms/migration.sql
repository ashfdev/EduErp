-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationTrigger" ADD VALUE 'STUDENT_ARRIVAL';
ALTER TYPE "NotificationTrigger" ADD VALUE 'STUDENT_DEPARTURE';

-- AlterTable
ALTER TABLE "AttendanceRules" ADD COLUMN     "sms_on_entry_exit" BOOLEAN NOT NULL DEFAULT false;

