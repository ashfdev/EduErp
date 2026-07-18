-- CreateEnum
CREATE TYPE "DegreeLevel" AS ENUM ('UNDERGRADUATE', 'GRADUATE', 'PHD');

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "degree_level" "DegreeLevel" NOT NULL DEFAULT 'UNDERGRADUATE';

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "achievements" TEXT,
ADD COLUMN     "publications" JSONB,
ADD COLUMN     "qualifications" TEXT;

-- CreateTable
CREATE TABLE "ImportantLink" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportantLink_pkey" PRIMARY KEY ("id")
);

