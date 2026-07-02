-- CreateTable
CREATE TABLE "JobPosting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "deadline" TIMESTAMP(3),
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Staff_salary_structure_id_idx" ON "Staff"("salary_structure_id");

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_salary_structure_id_fkey" FOREIGN KEY ("salary_structure_id") REFERENCES "SalaryStructure"("id") ON DELETE SET NULL ON UPDATE CASCADE;
