-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "rejoin_date" TIMESTAMP(3),
ADD COLUMN     "resignation_date" TIMESTAMP(3),
ADD COLUMN     "resignation_reason" TEXT;
