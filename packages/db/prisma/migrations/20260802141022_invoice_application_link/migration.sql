-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_student_id_fkey";

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "application_id" TEXT,
ALTER COLUMN "student_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Invoice_application_id_idx" ON "Invoice"("application_id");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "AdmissionApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

