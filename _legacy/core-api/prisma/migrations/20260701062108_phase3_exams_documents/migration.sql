-- CreateEnum
CREATE TYPE "GradingScale" AS ENUM ('BD_BOARD', 'CGPA_4', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('CLASS_TEST', 'HALF_YEARLY', 'ANNUAL', 'TERM_FINAL', 'SEMESTER_FINAL', 'BOARD_REGISTRATION', 'TRIAL');

-- CreateEnum
CREATE TYPE "MarkEntryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "RemarkStatus" AS ENUM ('PENDING', 'ADJUSTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QuizAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADED');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "gradingScale" "GradingScale" NOT NULL DEFAULT 'BD_BOARD';

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ExamType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "markEntryOpen" TIMESTAMP(3) NOT NULL,
    "markEntryClose" TIMESTAMP(3) NOT NULL,
    "has4thSubjectRule" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_classes" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,

    CONSTRAINT "exam_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_subject_configs" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "fullMarks" INTEGER NOT NULL,
    "passMarks" INTEGER NOT NULL,
    "isFourthSubject" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "exam_subject_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mark_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "marksObtained" DECIMAL(6,2),
    "isAbsent" BOOLEAN NOT NULL DEFAULT false,
    "grade" TEXT,
    "gpaPoint" DECIMAL(3,2),
    "status" "MarkEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "enteredBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mark_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remark_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "markEntryId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RemarkStatus" NOT NULL DEFAULT 'PENDING',
    "originalMarks" DECIMAL(6,2),
    "adjustedMarks" DECIMAL(6,2),
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remark_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_seat_plans" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "hall" TEXT NOT NULL,
    "seatNo" TEXT NOT NULL,
    "invigilatorId" TEXT,

    CONSTRAINT "exam_seat_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_publications" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,

    CONSTRAINT "result_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_results" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "totalMarks" DECIMAL(8,2) NOT NULL,
    "gpa" DECIMAL(3,2) NOT NULL,
    "letterGrade" TEXT NOT NULL,
    "hasFailed" BOOLEAN NOT NULL DEFAULT false,
    "positionInClass" INTEGER,
    "positionInSection" INTEGER,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctOption" TEXT NOT NULL,
    "marks" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quizzes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "examId" TEXT,
    "title" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "questionIds" JSONB NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "questionOrder" JSONB NOT NULL,
    "answers" JSONB,
    "score" INTEGER,
    "status" "QuizAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_registry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "publicPayload" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_registry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exams_tenantId_academicYearId_idx" ON "exams"("tenantId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_classes_examId_classId_key" ON "exam_classes"("examId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_subject_configs_examId_classId_subjectId_key" ON "exam_subject_configs"("examId", "classId", "subjectId");

-- CreateIndex
CREATE INDEX "mark_entries_tenantId_examId_idx" ON "mark_entries"("tenantId", "examId");

-- CreateIndex
CREATE UNIQUE INDEX "mark_entries_examId_studentId_subjectId_attemptNumber_key" ON "mark_entries"("examId", "studentId", "subjectId", "attemptNumber");

-- CreateIndex
CREATE INDEX "remark_requests_tenantId_status_idx" ON "remark_requests"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "exam_seat_plans_examId_studentId_key" ON "exam_seat_plans"("examId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "result_publications_examId_classId_key" ON "result_publications"("examId", "classId");

-- CreateIndex
CREATE INDEX "exam_results_tenantId_examId_classId_idx" ON "exam_results"("tenantId", "examId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_results_examId_studentId_key" ON "exam_results"("examId", "studentId");

-- CreateIndex
CREATE INDEX "questions_tenantId_subjectId_idx" ON "questions"("tenantId", "subjectId");

-- CreateIndex
CREATE INDEX "quizzes_tenantId_subjectId_idx" ON "quizzes"("tenantId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_attempts_quizId_studentId_key" ON "quiz_attempts"("quizId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "document_registry_verificationCode_key" ON "document_registry"("verificationCode");

-- CreateIndex
CREATE INDEX "document_registry_tenantId_entityId_idx" ON "document_registry"("tenantId", "entityId");

-- AddForeignKey
ALTER TABLE "exam_classes" ADD CONSTRAINT "exam_classes_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_subject_configs" ADD CONSTRAINT "exam_subject_configs_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_entries" ADD CONSTRAINT "mark_entries_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remark_requests" ADD CONSTRAINT "remark_requests_markEntryId_fkey" FOREIGN KEY ("markEntryId") REFERENCES "mark_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_seat_plans" ADD CONSTRAINT "exam_seat_plans_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
