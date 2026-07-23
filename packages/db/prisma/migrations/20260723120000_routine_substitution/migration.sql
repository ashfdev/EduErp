-- CreateTable
CREATE TABLE "RoutineSubstitution" (
    "id" TEXT NOT NULL,
    "routine_slot_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "original_teacher_id" TEXT NOT NULL,
    "substitute_teacher_id" TEXT NOT NULL,
    "reason" TEXT,
    "assigned_by_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutineSubstitution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoutineSubstitution_date_idx" ON "RoutineSubstitution"("date");

-- CreateIndex
CREATE INDEX "RoutineSubstitution_substitute_teacher_id_idx" ON "RoutineSubstitution"("substitute_teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineSubstitution_routine_slot_id_date_key" ON "RoutineSubstitution"("routine_slot_id", "date");

-- AddForeignKey
ALTER TABLE "RoutineSubstitution" ADD CONSTRAINT "RoutineSubstitution_routine_slot_id_fkey" FOREIGN KEY ("routine_slot_id") REFERENCES "RoutineSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineSubstitution" ADD CONSTRAINT "RoutineSubstitution_original_teacher_id_fkey" FOREIGN KEY ("original_teacher_id") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineSubstitution" ADD CONSTRAINT "RoutineSubstitution_substitute_teacher_id_fkey" FOREIGN KEY ("substitute_teacher_id") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

