-- CreateEnum
CREATE TYPE "TeachingResourceType" AS ENUM ('LECTURE_SLIDE', 'HANDOUT', 'ASSIGNMENT', 'OTHER');

-- CreateTable
CREATE TABLE "TeachingResource" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "section_id" TEXT,
    "subject_id" TEXT,
    "teacher_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "resource_type" "TeachingResourceType" NOT NULL DEFAULT 'OTHER',
    "blob_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "publish_at" TIMESTAMP(3),
    "expire_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeachingResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeachingResource_class_id_idx" ON "TeachingResource"("class_id");

-- CreateIndex
CREATE INDEX "TeachingResource_section_id_idx" ON "TeachingResource"("section_id");

-- CreateIndex
CREATE INDEX "TeachingResource_teacher_id_idx" ON "TeachingResource"("teacher_id");

-- AddForeignKey
ALTER TABLE "TeachingResource" ADD CONSTRAINT "TeachingResource_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingResource" ADD CONSTRAINT "TeachingResource_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingResource" ADD CONSTRAINT "TeachingResource_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingResource" ADD CONSTRAINT "TeachingResource_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

