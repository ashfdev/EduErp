-- CreateEnum
CREATE TYPE "PerformanceReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED');

-- CreateTable
CREATE TABLE "AppraisalTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppraisalTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceReview" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "review_period" TEXT NOT NULL,
    "reviewer_id" TEXT,
    "scores" JSONB NOT NULL,
    "overall_score" DOUBLE PRECISION,
    "overall_comments" TEXT,
    "status" "PerformanceReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PerformanceReview_staff_id_idx" ON "PerformanceReview"("staff_id");

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "AppraisalTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

