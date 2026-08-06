-- AlterTable
ALTER TABLE "RoutineSlot" ADD COLUMN     "pair_id" TEXT,
ADD COLUMN     "room_id" TEXT;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "requires_double_period" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requires_lab" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "is_lab" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoutineSlot_room_id_idx" ON "RoutineSlot"("room_id");

-- AddForeignKey
ALTER TABLE "RoutineSlot" ADD CONSTRAINT "RoutineSlot_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A Room can't host two different classes at the same day/period either --
-- same "WHERE ... IS NOT NULL" partial-unique-index shape as the existing
-- teacher-clash constraint, since room_id is null for the overwhelming
-- majority of rows and those must never collide with each other under this
-- constraint. Prisma's schema language can't express a partial index, so
-- this exists only here, mirroring every other partial index on this table.
CREATE UNIQUE INDEX "RoutineSlot_room_day_period_key" ON "RoutineSlot"("room_id", "day_of_week", "period_no") WHERE "room_id" IS NOT NULL;

