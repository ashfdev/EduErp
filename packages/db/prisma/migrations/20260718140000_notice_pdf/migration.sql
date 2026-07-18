-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'NOTICE';

-- AlterTable
ALTER TABLE "Notice" ADD COLUMN     "include_signature" BOOLEAN NOT NULL DEFAULT false;

