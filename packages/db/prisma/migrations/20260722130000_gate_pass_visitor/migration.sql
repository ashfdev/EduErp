-- CreateEnum
CREATE TYPE "VisitorType" AS ENUM ('GUARDIAN', 'VENDOR', 'OFFICIAL', 'OTHER');

-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "visitor_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "visitor_type" "VisitorType" NOT NULL,
    "relation_type" TEXT,
    "relation" TEXT,
    "student_id" TEXT,
    "class_id" TEXT,
    "section_id" TEXT,
    "reason" TEXT NOT NULL,
    "in_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "out_time" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visitor_student_id_idx" ON "Visitor"("student_id");

-- CreateIndex
CREATE INDEX "Visitor_in_time_idx" ON "Visitor"("in_time");

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

