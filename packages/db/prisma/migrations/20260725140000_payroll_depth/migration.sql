-- AlterTable
ALTER TABLE "PayrollRecord" ADD COLUMN     "absent_deduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "late_deduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "overtime_pay" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "pf_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "substitution_bonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "tds_amount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SalaryStructure" ADD COLUMN     "late_deduction_per_day" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "overtime_rate_per_hour" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "substitution_bonus_per_period" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PayrollGenerationRun" (
    "id" TEXT NOT NULL,
    "run_by_id" TEXT NOT NULL,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "department_id" TEXT,
    "processed_count" INTEGER NOT NULL,
    "total_payable" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PayrollGenerationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollGenerationRun_run_at_idx" ON "PayrollGenerationRun"("run_at");
