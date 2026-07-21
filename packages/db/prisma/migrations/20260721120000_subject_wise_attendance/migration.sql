-- CreateEnum
CREATE TYPE "PromotionAttendanceMode" AS ENUM ('AVERAGE_ALL_SUBJECTS', 'EVERY_SUBJECT_MINIMUM', 'DAILY_ATTENDANCE_ONLY');

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "check_in_at" TIMESTAMP(3),
ADD COLUMN     "check_out_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AttendanceRules" ADD COLUMN     "promotion_attendance_mode" "PromotionAttendanceMode" NOT NULL DEFAULT 'DAILY_ATTENDANCE_ONLY',
ADD COLUMN     "promotion_min_sessions_per_subject" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "DevicePunchLog" ADD COLUMN     "punch_type" INTEGER;

-- CreateTable
CREATE TABLE "SubjectAttendance" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "routine_slot_id" TEXT,
    "date" DATE NOT NULL,
    "period_no" INTEGER NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "marked_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubjectAttendance_section_id_subject_id_date_period_no_idx" ON "SubjectAttendance"("section_id", "subject_id", "date", "period_no");

-- CreateIndex
CREATE INDEX "SubjectAttendance_student_id_date_idx" ON "SubjectAttendance"("student_id", "date");

-- CreateIndex
CREATE INDEX "SubjectAttendance_routine_slot_id_idx" ON "SubjectAttendance"("routine_slot_id");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectAttendance_student_id_subject_id_date_period_no_key" ON "SubjectAttendance"("student_id", "subject_id", "date", "period_no");

-- AddForeignKey
ALTER TABLE "SubjectAttendance" ADD CONSTRAINT "SubjectAttendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectAttendance" ADD CONSTRAINT "SubjectAttendance_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectAttendance" ADD CONSTRAINT "SubjectAttendance_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectAttendance" ADD CONSTRAINT "SubjectAttendance_routine_slot_id_fkey" FOREIGN KEY ("routine_slot_id") REFERENCES "RoutineSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

