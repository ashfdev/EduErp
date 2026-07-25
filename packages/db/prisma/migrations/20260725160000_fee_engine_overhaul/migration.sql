-- CreateEnum
CREATE TYPE "FineScopeMode" AS ENUM ('CATEGORY_FINE', 'SUB_CATEGORY_FINE');

-- CreateEnum
CREATE TYPE "FineValueType" AS ENUM ('FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "FineApplicableFor" AS ENUM ('ALL_CLASSES', 'SPECIFIC_CLASSES');

-- AlterEnum
ALTER TYPE "InvoiceGenerationTrigger" ADD VALUE 'STUDENT_ON_DEMAND';

-- AlterTable
ALTER TABLE "FeeStructure" ADD COLUMN     "fee_sub_category_id" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "fee_sub_category_id" TEXT,
ADD COLUMN     "is_manual_fine" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "discount_amount" DOUBLE PRECISION,
ADD COLUMN     "receipt_batch_id" TEXT,
ADD COLUMN     "secondary_receipt_no" TEXT;

-- CreateTable
CREATE TABLE "FeeSubCategory" (
    "id" TEXT NOT NULL,
    "category" "FeeCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeSubCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeStructureClass" (
    "id" TEXT NOT NULL,
    "fee_structure_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeStructureClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeFineRule" (
    "id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "scope_mode" "FineScopeMode" NOT NULL,
    "fee_category" "FeeCategory" NOT NULL,
    "fee_sub_category_id" TEXT,
    "fine_value_type" "FineValueType" NOT NULL,
    "fine_value" DOUBLE PRECISION NOT NULL,
    "applicable_for" "FineApplicableFor" NOT NULL DEFAULT 'ALL_CLASSES',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeFineRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeFineRuleClass" (
    "id" TEXT NOT NULL,
    "fine_rule_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,

    CONSTRAINT "FeeFineRuleClass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeeSubCategory_category_name_key" ON "FeeSubCategory"("category", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FeeStructureClass_fee_structure_id_class_id_key" ON "FeeStructureClass"("fee_structure_id", "class_id");

-- CreateIndex
CREATE INDEX "FeeFineRule_academic_year_id_idx" ON "FeeFineRule"("academic_year_id");

-- CreateIndex
CREATE INDEX "FeeFineRule_fee_sub_category_id_idx" ON "FeeFineRule"("fee_sub_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "FeeFineRuleClass_fine_rule_id_class_id_key" ON "FeeFineRuleClass"("fine_rule_id", "class_id");

-- CreateIndex
CREATE INDEX "FeeStructure_fee_sub_category_id_idx" ON "FeeStructure"("fee_sub_category_id");

-- CreateIndex
CREATE INDEX "Invoice_fee_sub_category_id_idx" ON "Invoice"("fee_sub_category_id");

-- CreateIndex
CREATE INDEX "Payment_receipt_batch_id_idx" ON "Payment"("receipt_batch_id");

-- AddForeignKey
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_fee_sub_category_id_fkey" FOREIGN KEY ("fee_sub_category_id") REFERENCES "FeeSubCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_fee_sub_category_id_fkey" FOREIGN KEY ("fee_sub_category_id") REFERENCES "FeeSubCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructureClass" ADD CONSTRAINT "FeeStructureClass_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "FeeStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeStructureClass" ADD CONSTRAINT "FeeStructureClass_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeFineRule" ADD CONSTRAINT "FeeFineRule_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeFineRule" ADD CONSTRAINT "FeeFineRule_fee_sub_category_id_fkey" FOREIGN KEY ("fee_sub_category_id") REFERENCES "FeeSubCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeFineRuleClass" ADD CONSTRAINT "FeeFineRuleClass_fine_rule_id_fkey" FOREIGN KEY ("fine_rule_id") REFERENCES "FeeFineRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeFineRuleClass" ADD CONSTRAINT "FeeFineRuleClass_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
