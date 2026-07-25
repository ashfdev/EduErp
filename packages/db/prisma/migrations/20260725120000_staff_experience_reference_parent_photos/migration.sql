-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "father_photo_url" TEXT,
ADD COLUMN     "mother_photo_url" TEXT;

-- CreateTable
CREATE TABLE "StaffExperience" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "institution_name" TEXT NOT NULL,
    "designation" TEXT,
    "location" TEXT,
    "responsibility" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffReference" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "relation" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffExperience_staff_id_idx" ON "StaffExperience"("staff_id");

-- CreateIndex
CREATE INDEX "StaffReference_staff_id_idx" ON "StaffReference"("staff_id");

-- AddForeignKey
ALTER TABLE "StaffExperience" ADD CONSTRAINT "StaffExperience_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffReference" ADD CONSTRAINT "StaffReference_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

