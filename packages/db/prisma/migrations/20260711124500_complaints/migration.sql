-- CreateEnum
CREATE TYPE "ComplaintCategory" AS ENUM ('ACADEMIC', 'FACILITY', 'STAFF_CONDUCT', 'BULLYING', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "raised_by_user_id" TEXT NOT NULL,
    "category" "ComplaintCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_to_id" TEXT,
    "resolution_notes" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Complaint_raised_by_user_id_idx" ON "Complaint"("raised_by_user_id");

-- CreateIndex
CREATE INDEX "Complaint_status_idx" ON "Complaint"("status");

