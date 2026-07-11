-- CreateEnum
CREATE TYPE "AssignmentSubmissionStatus" AS ENUM ('SUBMITTED', 'LATE', 'GRADED');

-- AlterTable
ALTER TABLE "TeachingResource" ADD COLUMN     "due_date" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AssignmentSubmission" (
    "id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "blob_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grade" DOUBLE PRECISION,
    "feedback" TEXT,
    "graded_by_id" TEXT,
    "status" "AssignmentSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',

    CONSTRAINT "AssignmentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssignmentSubmission_resource_id_idx" ON "AssignmentSubmission"("resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentSubmission_resource_id_student_id_key" ON "AssignmentSubmission"("resource_id", "student_id");

-- AddForeignKey
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "TeachingResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

