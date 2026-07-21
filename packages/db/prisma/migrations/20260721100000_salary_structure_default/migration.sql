-- AlterEnum
ALTER TYPE "InAppNotificationType" ADD VALUE 'STAFF_MISSING_SALARY_STRUCTURE';

-- AlterTable
ALTER TABLE "SalaryStructure" ADD COLUMN     "is_default" BOOLEAN NOT NULL DEFAULT false;
