-- AlterEnum
ALTER TYPE "StudentDocType" ADD VALUE 'NID';

-- DropForeignKey
ALTER TABLE "StudentDocument" DROP CONSTRAINT "StudentDocument_student_id_fkey";

-- AlterTable
ALTER TABLE "AdmissionApplication" ADD COLUMN     "photo_url" TEXT;

-- AlterTable
ALTER TABLE "StudentDocument" ADD COLUMN     "application_id" TEXT,
ADD COLUMN     "slot" TEXT,
ALTER COLUMN "student_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "StudentDocument_application_id_idx" ON "StudentDocument"("application_id");

-- AddForeignKey
ALTER TABLE "StudentDocument" ADD CONSTRAINT "StudentDocument_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentDocument" ADD CONSTRAINT "StudentDocument_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "AdmissionApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

