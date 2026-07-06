-- AlterEnum
ALTER TYPE "FeeCategory" ADD VALUE 'FORM';

-- AlterTable
ALTER TABLE "AdmissionCycle" ADD COLUMN     "form_fee" DOUBLE PRECISION NOT NULL DEFAULT 0;

