-- AlterEnum
ALTER TYPE "InvoiceGenerationTrigger" ADD VALUE 'SCHEDULED';

-- AlterTable
ALTER TABLE "InvoiceGenerationRun" ALTER COLUMN "run_by_id" DROP NOT NULL;

