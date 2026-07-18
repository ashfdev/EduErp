-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "program_id" TEXT;

-- CreateIndex
CREATE INDEX "Staff_program_id_idx" ON "Staff"("program_id");

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

