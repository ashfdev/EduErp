-- DropIndex
DROP INDEX "RoutineSlot_class_id_section_id_day_of_week_period_no_key";

-- AlterTable
ALTER TABLE "RoutineSlot" ADD COLUMN     "group_id" TEXT;

-- AlterTable
ALTER TABLE "ShiftPeriod" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "RoutineSlot_group_id_idx" ON "RoutineSlot"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineSlot_class_id_section_id_group_id_day_of_week_period_key" ON "RoutineSlot"("class_id", "section_id", "group_id", "day_of_week", "period_no");

-- AddForeignKey
ALTER TABLE "RoutineSlot" ADD CONSTRAINT "RoutineSlot_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

