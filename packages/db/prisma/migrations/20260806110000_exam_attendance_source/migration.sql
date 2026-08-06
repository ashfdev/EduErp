-- CreateEnum
CREATE TYPE "ExamAttendanceSource" AS ENUM ('SUBJECT_WISE', 'DAILY_CAMPUS');

-- AlterTable
ALTER TABLE "AttendanceRules" ADD COLUMN     "exam_attendance_source" "ExamAttendanceSource" NOT NULL DEFAULT 'SUBJECT_WISE';

