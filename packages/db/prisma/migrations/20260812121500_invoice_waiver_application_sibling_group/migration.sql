-- DropForeignKey
ALTER TABLE "InvoiceWaiverApplication" DROP CONSTRAINT "InvoiceWaiverApplication_student_waiver_id_fkey";

-- AlterTable
ALTER TABLE "InvoiceWaiverApplication" ADD COLUMN     "sibling_group_id" TEXT,
ALTER COLUMN "student_waiver_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "InvoiceWaiverApplication_sibling_group_id_idx" ON "InvoiceWaiverApplication"("sibling_group_id");

-- AddForeignKey
ALTER TABLE "InvoiceWaiverApplication" ADD CONSTRAINT "InvoiceWaiverApplication_student_waiver_id_fkey" FOREIGN KEY ("student_waiver_id") REFERENCES "StudentWaiver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceWaiverApplication" ADD CONSTRAINT "InvoiceWaiverApplication_sibling_group_id_fkey" FOREIGN KEY ("sibling_group_id") REFERENCES "SiblingGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

