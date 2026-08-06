-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "custom_shift_end_time" TEXT,
ADD COLUMN     "custom_shift_start_time" TEXT,
ADD COLUMN     "shift_id" TEXT;

-- CreateIndex
CREATE INDEX "Staff_shift_id_idx" ON "Staff"("shift_id");

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

