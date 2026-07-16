-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "weekly_periods" INTEGER;

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "max_periods_per_day" INTEGER,
ADD COLUMN     "max_periods_per_week" INTEGER;
