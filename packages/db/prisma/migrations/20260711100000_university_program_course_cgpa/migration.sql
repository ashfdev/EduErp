-- CreateEnum
CREATE TYPE "CourseEnrollmentStatus" AS ENUM ('ENROLLED', 'COMPLETED', 'FAILED', 'DROPPED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "program_id" TEXT;

-- AlterTable
ALTER TABLE "FeeStructure" ADD COLUMN     "program_id" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "cgpa" DOUBLE PRECISION,
ADD COLUMN     "current_semester" INTEGER;

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_bn" TEXT,
    "code" TEXT NOT NULL,
    "department_id" TEXT,
    "duration_semesters" INTEGER NOT NULL,
    "total_credit_hours" DOUBLE PRECISION NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "semester_number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_bn" TEXT,
    "credit_hours" DOUBLE PRECISION NOT NULL,
    "course_type" "SubjectType" NOT NULL DEFAULT 'THEORY',
    "component_weights" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prerequisite" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "prerequisite_course_id" TEXT NOT NULL,

    CONSTRAINT "Prerequisite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseEnrollment" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "status" "CourseEnrollmentStatus" NOT NULL DEFAULT 'ENROLLED',
    "component_marks" JSONB,
    "marks_total" DOUBLE PRECISION,
    "grade_letter" TEXT,
    "grade_point" DOUBLE PRECISION,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entered_by_id" TEXT,

    CONSTRAINT "CourseEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Program_code_key" ON "Program"("code");

-- CreateIndex
CREATE INDEX "Program_department_id_idx" ON "Program"("department_id");

-- CreateIndex
CREATE INDEX "Course_program_id_idx" ON "Course"("program_id");

-- CreateIndex
CREATE UNIQUE INDEX "Course_program_id_code_key" ON "Course"("program_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Prerequisite_course_id_prerequisite_course_id_key" ON "Prerequisite"("course_id", "prerequisite_course_id");

-- CreateIndex
CREATE INDEX "CourseEnrollment_student_id_idx" ON "CourseEnrollment"("student_id");

-- CreateIndex
CREATE INDEX "CourseEnrollment_course_id_idx" ON "CourseEnrollment"("course_id");

-- CreateIndex
CREATE INDEX "CourseEnrollment_class_id_idx" ON "CourseEnrollment"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "CourseEnrollment_student_id_course_id_class_id_key" ON "CourseEnrollment"("student_id", "course_id", "class_id");

-- CreateIndex
CREATE INDEX "Class_program_id_idx" ON "Class"("program_id");

-- CreateIndex
CREATE INDEX "FeeStructure_program_id_idx" ON "FeeStructure"("program_id");

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prerequisite" ADD CONSTRAINT "Prerequisite_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prerequisite" ADD CONSTRAINT "Prerequisite_prerequisite_course_id_fkey" FOREIGN KEY ("prerequisite_course_id") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

