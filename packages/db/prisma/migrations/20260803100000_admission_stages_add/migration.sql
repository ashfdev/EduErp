-- CreateEnum
CREATE TYPE "AdmissionStageType" AS ENUM ('WRITTEN_TEST', 'INTERVIEW');

-- CreateEnum
CREATE TYPE "AdmissionStageStatus" AS ENUM ('SCHEDULED', 'PASSED', 'FAILED', 'NO_SHOW');

-- AlterTable
ALTER TABLE "AdmissionCycle" ADD COLUMN     "interview_date" TIMESTAMP(3),
ADD COLUMN     "interview_duration_minutes" INTEGER,
ADD COLUMN     "interview_instructions" TEXT,
ADD COLUMN     "interview_venue" TEXT,
ADD COLUMN     "requires_interview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requires_written_test" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "written_test_date" TIMESTAMP(3),
ADD COLUMN     "written_test_duration_minutes" INTEGER,
ADD COLUMN     "written_test_instructions" TEXT,
ADD COLUMN     "written_test_venue" TEXT;

-- CreateTable
CREATE TABLE "AdmissionApplicationStage" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "stage_type" "AdmissionStageType" NOT NULL,
    "scheduled_date" TIMESTAMP(3),
    "venue" TEXT,
    "duration_minutes" INTEGER,
    "instructions" TEXT,
    "hall_name" TEXT,
    "seat_number" TEXT,
    "status" "AdmissionStageStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notice_message" TEXT,
    "notified_at" TIMESTAMP(3),
    "scheduled_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionApplicationStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdmissionApplicationStage_cycle_id_idx" ON "AdmissionApplicationStage"("cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "AdmissionApplicationStage_application_id_stage_type_key" ON "AdmissionApplicationStage"("application_id", "stage_type");

-- AddForeignKey
ALTER TABLE "AdmissionApplicationStage" ADD CONSTRAINT "AdmissionApplicationStage_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "AdmissionApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionApplicationStage" ADD CONSTRAINT "AdmissionApplicationStage_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "AdmissionCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data copy-forward, Plan Twenty-Three Phase 5: fold every existing
-- cycle-wide "test" schedule into the new requires_written_test/* fields.
UPDATE "AdmissionCycle"
SET requires_written_test = requires_test,
    written_test_date = test_date,
    written_test_venue = test_venue,
    written_test_duration_minutes = test_duration_minutes,
    written_test_instructions = test_instructions
WHERE requires_test = true;

-- Data copy-forward: one AdmissionApplicationStage(WRITTEN_TEST) row per
-- existing AdmissionTestSeatPlan row, carrying its hall/seat across and
-- inheriting the schedule from its own cycle (now copied above). notified_at
-- is copied from the cycle-wide admit_card_published_at so an
-- already-notified applicant's admit-card link keeps working identically
-- after this migration -- no re-notification, no disruption.
INSERT INTO "AdmissionApplicationStage"
  (id, application_id, cycle_id, stage_type, scheduled_date, venue, duration_minutes, instructions, hall_name, seat_number, status, notified_at, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  sp.application_id,
  sp.cycle_id,
  'WRITTEN_TEST',
  c.written_test_date,
  c.written_test_venue,
  c.written_test_duration_minutes,
  c.written_test_instructions,
  sp.hall_name,
  sp.seat_number,
  'SCHEDULED',
  c.admit_card_published_at,
  sp.created_at,
  sp.updated_at
FROM "AdmissionTestSeatPlan" sp
JOIN "AdmissionCycle" c ON c.id = sp.cycle_id;

