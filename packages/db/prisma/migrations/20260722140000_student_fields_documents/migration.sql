-- CreateEnum
CREATE TYPE "StudentDocType" AS ENUM ('BIRTH_CERTIFICATE', 'TRANSFER_CERTIFICATE', 'TESTIMONIAL', 'ACADEMIC_CERTIFICATE', 'MARKSHEET', 'FATHER_NID', 'MOTHER_NID', 'OTHER');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "middle_name" TEXT,
ADD COLUMN     "nick_name" TEXT,
ADD COLUMN     "other_phone" TEXT,
ADD COLUMN     "passport_no" TEXT;

-- CreateTable
CREATE TABLE "StudentDocument" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "doc_type" "StudentDocType" NOT NULL,
    "blob_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by_id" TEXT,

    CONSTRAINT "StudentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentDocument_student_id_idx" ON "StudentDocument"("student_id");

-- AddForeignKey
ALTER TABLE "StudentDocument" ADD CONSTRAINT "StudentDocument_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

