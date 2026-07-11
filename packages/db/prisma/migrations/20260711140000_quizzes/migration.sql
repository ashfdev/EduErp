-- CreateEnum
CREATE TYPE "QuizAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADED');

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "question_text" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correct_option" TEXT NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "created_by_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "exam_id" TEXT,
    "title" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "question_order" JSONB NOT NULL,
    "answers" JSONB,
    "score" DOUBLE PRECISION,
    "status" "QuizAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "tamper_flags" JSONB,

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Question_subject_id_idx" ON "Question"("subject_id");

-- CreateIndex
CREATE INDEX "Quiz_subject_id_idx" ON "Quiz"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "QuizQuestion_quiz_id_question_id_key" ON "QuizQuestion"("quiz_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "QuizAttempt_quiz_id_student_id_key" ON "QuizAttempt"("quiz_id", "student_id");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "Quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "Quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

