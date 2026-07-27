-- CreateEnum
CREATE TYPE "MarkComponentSourceType" AS ENUM ('MANUAL', 'ATTENDANCE_PERCENTAGE', 'AVERAGE_OF_EXAM_TYPE');

-- DropForeignKey
ALTER TABLE "ExamGradeComponentConfig" DROP CONSTRAINT "ExamGradeComponentConfig_exam_id_fkey";

-- DropForeignKey
ALTER TABLE "ExamGradeComponentConfig" DROP CONSTRAINT "ExamGradeComponentConfig_source_exam_type_config_id_fkey";

-- DropForeignKey
ALTER TABLE "ExamGradeComponentConfig" DROP CONSTRAINT "ExamGradeComponentConfig_subject_id_fkey";

-- DropForeignKey
ALTER TABLE "ExamTypeGradeComponent" DROP CONSTRAINT "ExamTypeGradeComponent_exam_type_config_id_fkey";

-- DropForeignKey
ALTER TABLE "ExamTypeGradeComponent" DROP CONSTRAINT "ExamTypeGradeComponent_source_exam_type_config_id_fkey";

-- DropForeignKey
ALTER TABLE "MarkComponentConfig" DROP CONSTRAINT "MarkComponentConfig_exam_id_fkey";

-- DropForeignKey
ALTER TABLE "MarkComponentConfig" DROP CONSTRAINT "MarkComponentConfig_subject_id_fkey";

-- AlterTable
ALTER TABLE "MarkEntry" DROP COLUMN "component_marks",
DROP COLUMN "grade_component_marks",
ADD COLUMN     "component_values" JSONB;

-- AlterTable
ALTER TABLE "MarksheetDisplaySettings" DROP COLUMN "show_grade_composition",
ADD COLUMN     "show_mark_composition" BOOLEAN NOT NULL DEFAULT true;

-- DropTable
DROP TABLE "ExamGradeComponentConfig";

-- DropTable
DROP TABLE "ExamTypeGradeComponent";

-- DropTable
DROP TABLE "MarkComponentConfig";

-- DropEnum
DROP TYPE "GradeComponentEntryMode";

-- DropEnum
DROP TYPE "GradeComponentSourceType";

-- CreateTable
CREATE TABLE "ExamMarkComponent" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "max_marks" DOUBLE PRECISION NOT NULL,
    "source_type" "MarkComponentSourceType" NOT NULL DEFAULT 'MANUAL',
    "source_exam_type_config_id" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamMarkComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarkCompositionTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarkCompositionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarkCompositionTemplateItem" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "max_marks" DOUBLE PRECISION NOT NULL,
    "source_type" "MarkComponentSourceType" NOT NULL DEFAULT 'MANUAL',
    "source_exam_type_config_id" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MarkCompositionTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExamMarkComponent_exam_id_subject_id_idx" ON "ExamMarkComponent"("exam_id", "subject_id");

-- CreateIndex
CREATE INDEX "ExamMarkComponent_source_exam_type_config_id_idx" ON "ExamMarkComponent"("source_exam_type_config_id");

-- CreateIndex
CREATE UNIQUE INDEX "ExamMarkComponent_exam_id_subject_id_key_key" ON "ExamMarkComponent"("exam_id", "subject_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "MarkCompositionTemplateItem_template_id_key_key" ON "MarkCompositionTemplateItem"("template_id", "key");

-- AddForeignKey
ALTER TABLE "ExamMarkComponent" ADD CONSTRAINT "ExamMarkComponent_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamMarkComponent" ADD CONSTRAINT "ExamMarkComponent_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamMarkComponent" ADD CONSTRAINT "ExamMarkComponent_source_exam_type_config_id_fkey" FOREIGN KEY ("source_exam_type_config_id") REFERENCES "ExamTypeConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkCompositionTemplateItem" ADD CONSTRAINT "MarkCompositionTemplateItem_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "MarkCompositionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkCompositionTemplateItem" ADD CONSTRAINT "MarkCompositionTemplateItem_source_exam_type_config_id_fkey" FOREIGN KEY ("source_exam_type_config_id") REFERENCES "ExamTypeConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
