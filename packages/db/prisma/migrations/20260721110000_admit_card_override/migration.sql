-- CreateTable
CREATE TABLE "AdmitCardOverride" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "overridden_by_id" TEXT NOT NULL,
    "overridden_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_amount_at_time" DOUBLE PRECISION NOT NULL,
    "fine_amount_at_time" DOUBLE PRECISION NOT NULL,
    "exam_office_was_cleared" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdmitCardOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdmitCardOverride_exam_id_student_id_idx" ON "AdmitCardOverride"("exam_id", "student_id");

-- AddForeignKey
ALTER TABLE "AdmitCardOverride" ADD CONSTRAINT "AdmitCardOverride_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmitCardOverride" ADD CONSTRAINT "AdmitCardOverride_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

