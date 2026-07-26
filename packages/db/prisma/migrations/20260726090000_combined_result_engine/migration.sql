-- CreateEnum
CREATE TYPE "ResultCalculationMode" AS ENUM ('TERM_BLEND', 'COURSE_GRADEBOOK');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'COMBINED_RESULT';

-- AlterTable
ALTER TABLE "InstitutionConfig" ADD COLUMN     "result_calculation_mode" "ResultCalculationMode";

-- CreateTable
CREATE TABLE "ExtracurricularRemark" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "remarks" TEXT NOT NULL,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtracurricularRemark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExtracurricularRemark_student_id_academic_year_id_key" ON "ExtracurricularRemark"("student_id", "academic_year_id");

-- AddForeignKey
ALTER TABLE "ExtracurricularRemark" ADD CONSTRAINT "ExtracurricularRemark_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtracurricularRemark" ADD CONSTRAINT "ExtracurricularRemark_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
