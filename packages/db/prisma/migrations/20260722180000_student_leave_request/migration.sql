-- CreateEnum
CREATE TYPE "StudentLeaveApprovalMode" AS ENUM ('CLASS_TEACHER_ONLY', 'ALL_SUBJECT_TEACHERS');

-- CreateEnum
CREATE TYPE "StudentLeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PARTIALLY_APPROVED');

-- CreateEnum
CREATE TYPE "StudentLeaveApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "AttendanceRules" ADD COLUMN     "leave_approval_mode" "StudentLeaveApprovalMode" NOT NULL DEFAULT 'CLASS_TEACHER_ONLY';

-- CreateTable
CREATE TABLE "StudentLeaveRequest" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "StudentLeaveStatus" NOT NULL DEFAULT 'PENDING',
    "decided_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentLeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentLeaveApproval" (
    "id" TEXT NOT NULL,
    "leave_request_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "status" "StudentLeaveApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decided_at" TIMESTAMP(3),
    "rejection_reason" TEXT,

    CONSTRAINT "StudentLeaveApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentLeaveRequest_student_id_idx" ON "StudentLeaveRequest"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "StudentLeaveApproval_leave_request_id_teacher_id_key" ON "StudentLeaveApproval"("leave_request_id", "teacher_id");

-- AddForeignKey
ALTER TABLE "StudentLeaveRequest" ADD CONSTRAINT "StudentLeaveRequest_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentLeaveApproval" ADD CONSTRAINT "StudentLeaveApproval_leave_request_id_fkey" FOREIGN KEY ("leave_request_id") REFERENCES "StudentLeaveRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentLeaveApproval" ADD CONSTRAINT "StudentLeaveApproval_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

