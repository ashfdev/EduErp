-- CreateTable
CREATE TABLE "FeeStructureCoverageSummary" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "fee_structure_id" TEXT NOT NULL,
    "structure_name" TEXT NOT NULL,
    "category" "FeeCategory" NOT NULL,
    "frequency" "FeeFrequency" NOT NULL,
    "assignment_summary" TEXT NOT NULL,
    "expected_count" INTEGER NOT NULL,
    "invoiced_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeStructureCoverageSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeeStructureCoverageSummary_run_id_idx" ON "FeeStructureCoverageSummary"("run_id");

-- CreateIndex
CREATE INDEX "FeeStructureCoverageSummary_fee_structure_id_idx" ON "FeeStructureCoverageSummary"("fee_structure_id");

-- AddForeignKey
ALTER TABLE "FeeStructureCoverageSummary" ADD CONSTRAINT "FeeStructureCoverageSummary_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "FeeReconciliationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructureCoverageSummary" ADD CONSTRAINT "FeeStructureCoverageSummary_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "FeeStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

