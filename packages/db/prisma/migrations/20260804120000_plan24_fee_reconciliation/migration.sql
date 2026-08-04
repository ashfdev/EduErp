-- CreateEnum
CREATE TYPE "FeeReconciliationTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateEnum
CREATE TYPE "FeeReconciliationFindingType" AS ENUM ('COVERAGE_GAP', 'UNEXPECTED_INVOICE', 'ASSIGNMENT_GAP', 'AMOUNT_VARIANCE');

-- CreateEnum
CREATE TYPE "FeeReconciliationFindingStatus" AS ENUM ('OPEN', 'DISMISSED', 'RESOLVED');

-- AlterEnum
ALTER TYPE "InAppNotificationType" ADD VALUE 'FEE_RECONCILIATION_DIGEST';

-- CreateTable
CREATE TABLE "FeeReconciliationRun" (
    "id" TEXT NOT NULL,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "run_by_id" TEXT,
    "trigger" "FeeReconciliationTrigger" NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "coverage_gap_count" INTEGER NOT NULL,
    "unexpected_invoice_count" INTEGER NOT NULL,
    "assignment_gap_count" INTEGER NOT NULL,
    "amount_variance_count" INTEGER NOT NULL,

    CONSTRAINT "FeeReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeReconciliationFinding" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "type" "FeeReconciliationFindingType" NOT NULL,
    "student_id" TEXT,
    "fee_structure_id" TEXT,
    "invoice_id" TEXT,
    "class_id" TEXT,
    "section_id" TEXT,
    "group_id" TEXT,
    "expected_amount" DOUBLE PRECISION,
    "actual_amount" DOUBLE PRECISION,
    "description" TEXT NOT NULL,
    "status" "FeeReconciliationFindingStatus" NOT NULL DEFAULT 'OPEN',
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeReconciliationFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeeReconciliationRun_run_at_idx" ON "FeeReconciliationRun"("run_at");

-- CreateIndex
CREATE INDEX "FeeReconciliationFinding_run_id_idx" ON "FeeReconciliationFinding"("run_id");

-- CreateIndex
CREATE INDEX "FeeReconciliationFinding_status_idx" ON "FeeReconciliationFinding"("status");

-- CreateIndex
CREATE INDEX "FeeReconciliationFinding_student_id_idx" ON "FeeReconciliationFinding"("student_id");

-- AddForeignKey
ALTER TABLE "FeeReconciliationFinding" ADD CONSTRAINT "FeeReconciliationFinding_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "FeeReconciliationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeReconciliationFinding" ADD CONSTRAINT "FeeReconciliationFinding_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeReconciliationFinding" ADD CONSTRAINT "FeeReconciliationFinding_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "FeeStructure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeReconciliationFinding" ADD CONSTRAINT "FeeReconciliationFinding_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeReconciliationFinding" ADD CONSTRAINT "FeeReconciliationFinding_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeReconciliationFinding" ADD CONSTRAINT "FeeReconciliationFinding_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeReconciliationFinding" ADD CONSTRAINT "FeeReconciliationFinding_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

