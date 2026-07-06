-- DropForeignKey
ALTER TABLE "TeachingResource" DROP CONSTRAINT "TeachingResource_teacher_id_fkey";

-- AlterTable
ALTER TABLE "TeachingResource" ALTER COLUMN "teacher_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "TeachingResource" ADD CONSTRAINT "TeachingResource_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

