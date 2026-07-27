-- CreateEnum
CREATE TYPE "GradeComponentEntryMode" AS ENUM ('SCALED', 'DIRECT');

-- CreateEnum
CREATE TYPE "GradeComponentSourceType" AS ENUM ('MANUAL', 'ATTENDANCE_PERCENTAGE', 'AVERAGE_OF_EXAM_TYPE');

-- AlterTable
ALTER TABLE "MarkEntry" ADD COLUMN     "grade_component_marks" JSONB;

-- CreateTable
CREATE TABLE "ExamTypeGradeComponent" (
    "id" TEXT NOT NULL,
    "exam_type_config_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "weight_percentage" DOUBLE PRECISION NOT NULL,
    "entry_mode" "GradeComponentEntryMode",
    "reference_full_marks_default" DOUBLE PRECISION,
    "source_type" "GradeComponentSourceType" NOT NULL DEFAULT 'MANUAL',
    "source_exam_type_config_id" TEXT,
    "is_main_exam_component" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamTypeGradeComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamGradeComponentConfig" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "weight_marks" DOUBLE PRECISION NOT NULL,
    "entry_mode" "GradeComponentEntryMode",
    "reference_full_marks" DOUBLE PRECISION,
    "source_type" "GradeComponentSourceType" NOT NULL DEFAULT 'MANUAL',
    "source_exam_type_config_id" TEXT,
    "is_main_exam_component" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamGradeComponentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamTypeGradeComponent_exam_type_config_id_key_key" ON "ExamTypeGradeComponent"("exam_type_config_id", "key");

-- CreateIndex
CREATE INDEX "ExamGradeComponentConfig_exam_id_subject_id_idx" ON "ExamGradeComponentConfig"("exam_id", "subject_id");

-- CreateIndex
CREATE INDEX "ExamGradeComponentConfig_source_exam_type_config_id_idx" ON "ExamGradeComponentConfig"("source_exam_type_config_id");

-- CreateIndex
CREATE UNIQUE INDEX "ExamGradeComponentConfig_exam_id_subject_id_key_key" ON "ExamGradeComponentConfig"("exam_id", "subject_id", "key");

-- AddForeignKey
ALTER TABLE "ExamTypeGradeComponent" ADD CONSTRAINT "ExamTypeGradeComponent_exam_type_config_id_fkey" FOREIGN KEY ("exam_type_config_id") REFERENCES "ExamTypeConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamTypeGradeComponent" ADD CONSTRAINT "ExamTypeGradeComponent_source_exam_type_config_id_fkey" FOREIGN KEY ("source_exam_type_config_id") REFERENCES "ExamTypeConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamGradeComponentConfig" ADD CONSTRAINT "ExamGradeComponentConfig_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamGradeComponentConfig" ADD CONSTRAINT "ExamGradeComponentConfig_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamGradeComponentConfig" ADD CONSTRAINT "ExamGradeComponentConfig_source_exam_type_config_id_fkey" FOREIGN KEY ("source_exam_type_config_id") REFERENCES "ExamTypeConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
