-- Session-aware seat plan generation (Phase 83) — a real exam often runs
-- across 2-3 time sessions with a different set of classes in each; seat
-- generation must scope to one session at a time instead of seating every
-- class tied to the exam together in one undifferentiated pass.

CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExamSession_exam_id_idx" ON "ExamSession"("exam_id");

ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "Exam"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE TABLE "ExamSessionClass" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,

    CONSTRAINT "ExamSessionClass_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExamSessionClass_session_id_class_id_key" ON "ExamSessionClass"("session_id", "class_id");

ALTER TABLE "ExamSessionClass" ADD CONSTRAINT "ExamSessionClass_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ExamSession"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "ExamSessionClass" ADD CONSTRAINT "ExamSessionClass_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- Nullable — existing (pre-session) seat plans stay valid; every new
-- generation run always sets this.
ALTER TABLE "ExamSeatPlan" ADD COLUMN "session_id" TEXT;
ALTER TABLE "ExamSeatPlan" ADD CONSTRAINT "ExamSeatPlan_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ExamSession"("id") ON UPDATE CASCADE ON DELETE SET NULL;
