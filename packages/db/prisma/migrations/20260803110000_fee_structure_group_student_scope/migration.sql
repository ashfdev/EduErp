-- DropIndex
DROP INDEX "FeeStructureClass_fee_structure_id_class_id_key";

-- AlterTable
ALTER TABLE "FeeStructureClass" ADD COLUMN     "group_id" TEXT;

-- CreateTable
CREATE TABLE "FeeStructureStudent" (
    "id" TEXT NOT NULL,
    "fee_structure_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "assigned_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeStructureStudent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeeStructureStudent_student_id_idx" ON "FeeStructureStudent"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "FeeStructureStudent_fee_structure_id_student_id_key" ON "FeeStructureStudent"("fee_structure_id", "student_id");

-- CreateIndex
CREATE INDEX "FeeStructureClass_group_id_idx" ON "FeeStructureClass"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "FeeStructureClass_fee_structure_id_class_id_group_id_key" ON "FeeStructureClass"("fee_structure_id", "class_id", "group_id");

-- AddForeignKey
ALTER TABLE "FeeStructureClass" ADD CONSTRAINT "FeeStructureClass_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructureStudent" ADD CONSTRAINT "FeeStructureStudent_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "FeeStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructureStudent" ADD CONSTRAINT "FeeStructureStudent_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

