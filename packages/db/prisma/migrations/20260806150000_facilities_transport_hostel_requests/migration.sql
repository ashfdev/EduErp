-- CreateEnum
CREATE TYPE "FacilityRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "TransportRoute" ADD COLUMN     "seat_capacity" INTEGER;

-- CreateTable
CREATE TABLE "TransportRequest" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "pickup_stop" TEXT,
    "reason" TEXT,
    "requested_by_user_id" TEXT NOT NULL,
    "status" "FacilityRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "fee_structure_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostelRequest" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "reason" TEXT,
    "requested_by_user_id" TEXT NOT NULL,
    "status" "FacilityRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "fee_structure_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HostelRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransportRequest_student_id_idx" ON "TransportRequest"("student_id");

-- CreateIndex
CREATE INDEX "TransportRequest_route_id_idx" ON "TransportRequest"("route_id");

-- CreateIndex
CREATE INDEX "TransportRequest_status_idx" ON "TransportRequest"("status");

-- CreateIndex
CREATE INDEX "HostelRequest_student_id_idx" ON "HostelRequest"("student_id");

-- CreateIndex
CREATE INDEX "HostelRequest_room_id_idx" ON "HostelRequest"("room_id");

-- CreateIndex
CREATE INDEX "HostelRequest_status_idx" ON "HostelRequest"("status");

-- AddForeignKey
ALTER TABLE "TransportRequest" ADD CONSTRAINT "TransportRequest_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRequest" ADD CONSTRAINT "TransportRequest_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "TransportRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRequest" ADD CONSTRAINT "TransportRequest_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "FeeStructure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostelRequest" ADD CONSTRAINT "HostelRequest_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostelRequest" ADD CONSTRAINT "HostelRequest_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "HostelRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostelRequest" ADD CONSTRAINT "HostelRequest_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "FeeStructure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

