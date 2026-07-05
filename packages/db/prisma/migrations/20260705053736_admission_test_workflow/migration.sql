-- AlterTable
ALTER TABLE "AdmissionCycle" ADD COLUMN     "admit_card_published_at" TIMESTAMP(3),
ADD COLUMN     "requires_test" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "test_date" TIMESTAMP(3),
ADD COLUMN     "test_duration_minutes" INTEGER,
ADD COLUMN     "test_instructions" TEXT,
ADD COLUMN     "test_venue" TEXT;

-- CreateTable
CREATE TABLE "AdmissionTestSeatPlan" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "hall_name" TEXT,
    "seat_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionTestSeatPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionTestSeatPlan_application_id_key" ON "AdmissionTestSeatPlan"("application_id");

-- CreateIndex
CREATE INDEX "AdmissionTestSeatPlan_cycle_id_idx" ON "AdmissionTestSeatPlan"("cycle_id");

-- AddForeignKey
ALTER TABLE "AdmissionTestSeatPlan" ADD CONSTRAINT "AdmissionTestSeatPlan_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "AdmissionApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionTestSeatPlan" ADD CONSTRAINT "AdmissionTestSeatPlan_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "AdmissionCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
