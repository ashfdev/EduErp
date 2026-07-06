-- CreateIndex
CREATE INDEX "RoutineSlot_teacher_id_idx" ON "RoutineSlot"("teacher_id");

-- AddForeignKey
ALTER TABLE "RoutineSlot" ADD CONSTRAINT "RoutineSlot_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

