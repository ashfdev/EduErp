-- CreateEnum
CREATE TYPE "AdvanceStatus" AS ENUM ('PENDING', 'PARTIAL', 'CLEARED');

-- CreateEnum
CREATE TYPE "PFTransactionType" AS ENUM ('CONTRIBUTION', 'WITHDRAWAL');

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "reorder_level" INTEGER;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "sibling_group_id" TEXT;

-- CreateTable
CREATE TABLE "StaffAdvance" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "amount_cleared" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthly_emi" DOUBLE PRECISION,
    "reason" TEXT,
    "date_given" DATE NOT NULL,
    "status" "AdvanceStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvidentFund" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "total_balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProvidentFund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PFTransaction" (
    "id" TEXT NOT NULL,
    "provident_fund_id" TEXT NOT NULL,
    "payroll_record_id" TEXT,
    "transaction_type" "PFTransactionType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PFTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxDeduction" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "payroll_record_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryIncrement" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "increment_amount" DOUBLE PRECISION NOT NULL,
    "new_gross_salary" DOUBLE PRECISION NOT NULL,
    "effective_date" DATE NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryIncrement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveEncashment" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "unused_leaves" INTEGER NOT NULL,
    "encashed_amount" DOUBLE PRECISION NOT NULL,
    "date_paid" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveEncashment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlumniProfile" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "graduation_year" INTEGER NOT NULL,
    "current_profession" TEXT,
    "higher_education" TEXT,
    "is_member_of_assoc" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlumniProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiblingGroup" (
    "id" TEXT NOT NULL,
    "auto_waiver_percentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiblingGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffAdvance_staff_id_idx" ON "StaffAdvance"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "ProvidentFund_staff_id_key" ON "ProvidentFund"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "PFTransaction_payroll_record_id_key" ON "PFTransaction"("payroll_record_id");

-- CreateIndex
CREATE INDEX "PFTransaction_provident_fund_id_idx" ON "PFTransaction"("provident_fund_id");

-- CreateIndex
CREATE UNIQUE INDEX "TaxDeduction_payroll_record_id_key" ON "TaxDeduction"("payroll_record_id");

-- CreateIndex
CREATE INDEX "TaxDeduction_staff_id_idx" ON "TaxDeduction"("staff_id");

-- CreateIndex
CREATE INDEX "SalaryIncrement_staff_id_idx" ON "SalaryIncrement"("staff_id");

-- CreateIndex
CREATE INDEX "LeaveEncashment_staff_id_idx" ON "LeaveEncashment"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "AlumniProfile_student_id_key" ON "AlumniProfile"("student_id");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_sibling_group_id_fkey" FOREIGN KEY ("sibling_group_id") REFERENCES "SiblingGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAdvance" ADD CONSTRAINT "StaffAdvance_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvidentFund" ADD CONSTRAINT "ProvidentFund_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PFTransaction" ADD CONSTRAINT "PFTransaction_provident_fund_id_fkey" FOREIGN KEY ("provident_fund_id") REFERENCES "ProvidentFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PFTransaction" ADD CONSTRAINT "PFTransaction_payroll_record_id_fkey" FOREIGN KEY ("payroll_record_id") REFERENCES "PayrollRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxDeduction" ADD CONSTRAINT "TaxDeduction_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxDeduction" ADD CONSTRAINT "TaxDeduction_payroll_record_id_fkey" FOREIGN KEY ("payroll_record_id") REFERENCES "PayrollRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryIncrement" ADD CONSTRAINT "SalaryIncrement_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveEncashment" ADD CONSTRAINT "LeaveEncashment_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlumniProfile" ADD CONSTRAINT "AlumniProfile_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

