-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InAppNotificationType" ADD VALUE 'ADMISSION_PAYMENT_RECEIVED';
ALTER TYPE "InAppNotificationType" ADD VALUE 'ADMISSION_PAYMENT_PENDING_VERIFICATION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationTrigger" ADD VALUE 'ADMISSION_PAYMENT_RECEIVED';
ALTER TYPE "NotificationTrigger" ADD VALUE 'ADMISSION_PAYMENT_PENDING_VERIFICATION';

