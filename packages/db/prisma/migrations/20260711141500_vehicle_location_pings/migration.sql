-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "device_api_key" TEXT;

-- CreateTable
CREATE TABLE "VehicleLocationPing" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "speed" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleLocationPing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleLocationPing_vehicle_id_recorded_at_idx" ON "VehicleLocationPing"("vehicle_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_device_api_key_key" ON "Vehicle"("device_api_key");

-- AddForeignKey
ALTER TABLE "VehicleLocationPing" ADD CONSTRAINT "VehicleLocationPing_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

