-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_bn" TEXT,
    "code" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "group_id" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "group_id" TEXT;

-- CreateIndex
CREATE INDEX "Group_class_id_idx" ON "Group"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "Group_class_id_code_key" ON "Group"("class_id", "code");

-- CreateIndex
CREATE INDEX "Subject_group_id_idx" ON "Subject"("group_id");

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
