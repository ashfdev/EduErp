-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InAppNotificationType" ADD VALUE 'TRANSPORT_REQUESTED';
ALTER TYPE "InAppNotificationType" ADD VALUE 'TRANSPORT_REQUEST_APPROVED';
ALTER TYPE "InAppNotificationType" ADD VALUE 'TRANSPORT_REQUEST_REJECTED';
ALTER TYPE "InAppNotificationType" ADD VALUE 'HOSTEL_REQUESTED';
ALTER TYPE "InAppNotificationType" ADD VALUE 'HOSTEL_REQUEST_APPROVED';
ALTER TYPE "InAppNotificationType" ADD VALUE 'HOSTEL_REQUEST_REJECTED';

