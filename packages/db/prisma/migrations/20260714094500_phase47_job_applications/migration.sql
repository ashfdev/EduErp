-- CreateEnum
CREATE TYPE "JobApplicationStatus" AS ENUM ('SUBMITTED', 'SHORTLISTED', 'REJECTED', 'HIRED');

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "job_posting_id" TEXT NOT NULL,
    "applicant_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "cv_blob_key" TEXT NOT NULL,
    "cover_note" TEXT,
    "status" "JobApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobApplication_job_posting_id_idx" ON "JobApplication"("job_posting_id");

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_job_posting_id_fkey" FOREIGN KEY ("job_posting_id") REFERENCES "JobPosting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

