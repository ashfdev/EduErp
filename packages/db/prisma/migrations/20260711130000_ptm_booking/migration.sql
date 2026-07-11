-- CreateEnum
CREATE TYPE "PTMBookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PTMSlot" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "is_booked" BOOLEAN NOT NULL DEFAULT false,
    "class_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PTMSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PTMBooking" (
    "id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "guardian_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "notes" TEXT,
    "status" "PTMBookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "booked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PTMBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PTMSlot_teacher_id_idx" ON "PTMSlot"("teacher_id");

-- CreateIndex
CREATE INDEX "PTMSlot_date_idx" ON "PTMSlot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "PTMBooking_slot_id_key" ON "PTMBooking"("slot_id");

-- CreateIndex
CREATE INDEX "PTMBooking_guardian_id_idx" ON "PTMBooking"("guardian_id");

-- AddForeignKey
ALTER TABLE "PTMSlot" ADD CONSTRAINT "PTMSlot_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PTMSlot" ADD CONSTRAINT "PTMSlot_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PTMBooking" ADD CONSTRAINT "PTMBooking_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "PTMSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PTMBooking" ADD CONSTRAINT "PTMBooking_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "Guardian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PTMBooking" ADD CONSTRAINT "PTMBooking_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

