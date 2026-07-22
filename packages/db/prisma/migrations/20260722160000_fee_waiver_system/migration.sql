-- CreateEnum
CREATE TYPE "WaiverDiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateTable
CREATE TABLE "WaiverType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discount_type" "WaiverDiscountType" NOT NULL,
    "discount_value" DOUBLE PRECISION NOT NULL,
    "applicable_categories" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaiverType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentWaiver" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "waiver_type_id" TEXT NOT NULL,
    "academic_year_id" TEXT,
    "assigned_by_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_id" TEXT,

    CONSTRAINT "StudentWaiver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceWaiverApplication" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "student_waiver_id" TEXT NOT NULL,
    "discount_amount" DOUBLE PRECISION NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceWaiverApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentWaiver_student_id_idx" ON "StudentWaiver"("student_id");

-- CreateIndex
CREATE INDEX "InvoiceWaiverApplication_invoice_id_idx" ON "InvoiceWaiverApplication"("invoice_id");

-- CreateIndex
CREATE INDEX "InvoiceWaiverApplication_student_waiver_id_idx" ON "InvoiceWaiverApplication"("student_waiver_id");

-- AddForeignKey
ALTER TABLE "StudentWaiver" ADD CONSTRAINT "StudentWaiver_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentWaiver" ADD CONSTRAINT "StudentWaiver_waiver_type_id_fkey" FOREIGN KEY ("waiver_type_id") REFERENCES "WaiverType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentWaiver" ADD CONSTRAINT "StudentWaiver_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceWaiverApplication" ADD CONSTRAINT "InvoiceWaiverApplication_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceWaiverApplication" ADD CONSTRAINT "InvoiceWaiverApplication_student_waiver_id_fkey" FOREIGN KEY ("student_waiver_id") REFERENCES "StudentWaiver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

