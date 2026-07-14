-- AlterTable
ALTER TABLE "AttendanceRules" ADD COLUMN     "working_days" JSONB;

-- AlterTable
ALTER TABLE "RoutineSlot" ADD COLUMN     "generated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ShiftPeriod" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "period_no" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "is_break" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ShiftPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftPeriod_shift_id_period_no_key" ON "ShiftPeriod"("shift_id", "period_no");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineSlot_class_id_section_id_day_of_week_period_no_key" ON "RoutineSlot"("class_id", "section_id", "day_of_week", "period_no");

-- AddForeignKey
ALTER TABLE "ShiftPeriod" ADD CONSTRAINT "ShiftPeriod_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

