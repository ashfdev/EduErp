-- CreateEnum
CREATE TYPE "DisciplineCategory" AS ENUM ('INCIDENT', 'COUNSELING', 'COMMENDATION');

-- CreateTable
CREATE TABLE "DisciplineRecord" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "recorded_by_id" TEXT,
    "category" "DisciplineCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "action_taken" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisciplineRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DisciplineRecord_student_id_idx" ON "DisciplineRecord"("student_id");

-- AddForeignKey
ALTER TABLE "DisciplineRecord" ADD CONSTRAINT "DisciplineRecord_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

