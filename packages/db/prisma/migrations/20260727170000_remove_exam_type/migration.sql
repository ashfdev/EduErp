-- AlterEnum
BEGIN;
CREATE TYPE "DocumentType_new" AS ENUM ('STUDENT_ID_CARD', 'STAFF_ID_CARD', 'ADMIT_CARD', 'REGISTRATION_CARD', 'MARKSHEET', 'BLANK_MARKSHEET', 'REPORT_CARD', 'TABULATION_SHEET', 'TESTIMONIAL', 'TRANSFER_CERTIFICATE', 'ATTENDANCE_SHEET', 'ATTENDANCE_BLANK', 'FEE_RECEIPT', 'PAYSLIP', 'SYLLABUS', 'MERIT_LIST', 'CERTIFICATE', 'TRANSPORT_CARD', 'HOSTEL_CARD', 'SEAT_PLAN', 'NOTICE', 'VISITOR_SLIP', 'ROUTINE');
ALTER TABLE "AuthorityConfig" ALTER COLUMN "doc_type" TYPE "DocumentType_new" USING ("doc_type"::text::"DocumentType_new");
ALTER TABLE "DocumentTemplate" ALTER COLUMN "doc_type" TYPE "DocumentType_new" USING ("doc_type"::text::"DocumentType_new");
ALTER TYPE "DocumentType" RENAME TO "DocumentType_old";
ALTER TYPE "DocumentType_new" RENAME TO "DocumentType";
DROP TYPE "public"."DocumentType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "MarkComponentSourceType_new" AS ENUM ('MANUAL', 'ATTENDANCE_PERCENTAGE', 'AVERAGE_OF_EXAMS');
ALTER TABLE "public"."ExamMarkComponent" ALTER COLUMN "source_type" DROP DEFAULT;
ALTER TABLE "public"."MarkCompositionTemplateItem" ALTER COLUMN "source_type" DROP DEFAULT;
ALTER TABLE "ExamMarkComponent" ALTER COLUMN "source_type" TYPE "MarkComponentSourceType_new" USING ("source_type"::text::"MarkComponentSourceType_new");
ALTER TABLE "MarkCompositionTemplateItem" ALTER COLUMN "source_type" TYPE "MarkComponentSourceType_new" USING ("source_type"::text::"MarkComponentSourceType_new");
ALTER TYPE "MarkComponentSourceType" RENAME TO "MarkComponentSourceType_old";
ALTER TYPE "MarkComponentSourceType_new" RENAME TO "MarkComponentSourceType";
DROP TYPE "public"."MarkComponentSourceType_old";
ALTER TABLE "ExamMarkComponent" ALTER COLUMN "source_type" SET DEFAULT 'MANUAL';
ALTER TABLE "MarkCompositionTemplateItem" ALTER COLUMN "source_type" SET DEFAULT 'MANUAL';
COMMIT;

-- DropForeignKey
ALTER TABLE "Exam" DROP CONSTRAINT "Exam_exam_type_config_id_fkey";

-- DropForeignKey
ALTER TABLE "ExamMarkComponent" DROP CONSTRAINT "ExamMarkComponent_source_exam_type_config_id_fkey";

-- DropForeignKey
ALTER TABLE "ExtracurricularRemark" DROP CONSTRAINT "ExtracurricularRemark_academic_year_id_fkey";

-- DropForeignKey
ALTER TABLE "ExtracurricularRemark" DROP CONSTRAINT "ExtracurricularRemark_student_id_fkey";

-- DropForeignKey
ALTER TABLE "MarkCompositionTemplateItem" DROP CONSTRAINT "MarkCompositionTemplateItem_source_exam_type_config_id_fkey";

-- DropIndex
DROP INDEX "ExamMarkComponent_source_exam_type_config_id_idx";

-- AlterTable
ALTER TABLE "Exam" DROP COLUMN "exam_type_config_id";

-- AlterTable
ALTER TABLE "ExamMarkComponent" DROP COLUMN "source_exam_type_config_id";

-- AlterTable
ALTER TABLE "InstitutionConfig" DROP COLUMN "result_calculation_mode";

-- AlterTable
ALTER TABLE "MarkCompositionTemplateItem" DROP COLUMN "source_exam_type_config_id";

-- DropTable
DROP TABLE "ExamTypeConfig";

-- DropTable
DROP TABLE "ExtracurricularRemark";

-- DropEnum
DROP TYPE "ResultCalculationMode";

-- CreateTable
CREATE TABLE "ExamMarkComponentSourceExam" (
    "id" TEXT NOT NULL,
    "component_id" TEXT NOT NULL,
    "source_exam_id" TEXT NOT NULL,

    CONSTRAINT "ExamMarkComponentSourceExam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExamMarkComponentSourceExam_source_exam_id_idx" ON "ExamMarkComponentSourceExam"("source_exam_id");

-- CreateIndex
CREATE UNIQUE INDEX "ExamMarkComponentSourceExam_component_id_source_exam_id_key" ON "ExamMarkComponentSourceExam"("component_id", "source_exam_id");

-- AddForeignKey
ALTER TABLE "ExamMarkComponentSourceExam" ADD CONSTRAINT "ExamMarkComponentSourceExam_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "ExamMarkComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamMarkComponentSourceExam" ADD CONSTRAINT "ExamMarkComponentSourceExam_source_exam_id_fkey" FOREIGN KEY ("source_exam_id") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
