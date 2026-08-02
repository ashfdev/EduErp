-- DropForeignKey
ALTER TABLE "AdmissionTestSeatPlan" DROP CONSTRAINT "AdmissionTestSeatPlan_application_id_fkey";

-- DropForeignKey
ALTER TABLE "AdmissionTestSeatPlan" DROP CONSTRAINT "AdmissionTestSeatPlan_cycle_id_fkey";

-- AlterTable
ALTER TABLE "AdmissionCycle" DROP COLUMN "admit_card_published_at",
DROP COLUMN "requires_test",
DROP COLUMN "test_date",
DROP COLUMN "test_duration_minutes",
DROP COLUMN "test_instructions",
DROP COLUMN "test_venue";

-- DropTable
DROP TABLE "AdmissionTestSeatPlan";

