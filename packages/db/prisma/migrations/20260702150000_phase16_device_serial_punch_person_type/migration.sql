-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "serial_number" TEXT;

-- AlterTable
ALTER TABLE "DevicePunchLog" ADD COLUMN     "mapped_person_type" "PersonType";

-- CreateIndex
CREATE UNIQUE INDEX "Device_serial_number_key" ON "Device"("serial_number");

