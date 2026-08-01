-- CreateIndex
CREATE UNIQUE INDEX "Invoice_student_id_fee_structure_id_month_year_key" ON "Invoice"("student_id", "fee_structure_id", "month", "year");

