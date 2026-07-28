-- AlterTable
ALTER TABLE "ExamSeatPlan" ADD COLUMN     "hall_id" TEXT,
ADD COLUMN     "row_number" INTEGER,
ADD COLUMN     "seat_in_row" INTEGER;

-- CreateTable
CREATE TABLE "ExamHall" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "room_number" TEXT,
    "floor" TEXT,
    "rows" INTEGER NOT NULL DEFAULT 1,
    "seats_per_row" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamHall_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ExamSeatPlan" ADD CONSTRAINT "ExamSeatPlan_hall_id_fkey" FOREIGN KEY ("hall_id") REFERENCES "ExamHall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

