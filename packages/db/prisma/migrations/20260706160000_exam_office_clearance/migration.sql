-- AlterTable
ALTER TABLE "ExamSeatPlan" ADD COLUMN     "exam_office_cleared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "exam_office_cleared_at" TIMESTAMP(3),
ADD COLUMN     "exam_office_cleared_by_id" TEXT;

