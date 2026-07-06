-- AlterTable
ALTER TABLE "MarkEntry" ADD COLUMN     "component_marks" JSONB;

-- CreateTable
CREATE TABLE "MarkComponentConfig" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "max_marks" DOUBLE PRECISION NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarkComponentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarkComponentConfig_exam_id_subject_id_idx" ON "MarkComponentConfig"("exam_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "MarkComponentConfig_exam_id_subject_id_key_key" ON "MarkComponentConfig"("exam_id", "subject_id", "key");

-- AddForeignKey
ALTER TABLE "MarkComponentConfig" ADD CONSTRAINT "MarkComponentConfig_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkComponentConfig" ADD CONSTRAINT "MarkComponentConfig_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

