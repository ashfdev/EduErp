-- AlterTable
ALTER TABLE "Guardian" ADD COLUMN     "user_id" TEXT;

-- CreateTable
CREATE TABLE "Homework" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "section_id" TEXT,
    "subject_id" TEXT NOT NULL,
    "teacher_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "attachment_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Homework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineSlot" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "section_id" TEXT,
    "day_of_week" INTEGER NOT NULL,
    "period_no" INTEGER NOT NULL,
    "subject_id" TEXT,
    "teacher_id" TEXT,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,

    CONSTRAINT "RoutineSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "keys_p256dh" TEXT NOT NULL,
    "keys_auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Homework_class_id_idx" ON "Homework"("class_id");

-- CreateIndex
CREATE INDEX "Homework_section_id_idx" ON "Homework"("section_id");

-- CreateIndex
CREATE INDEX "RoutineSlot_class_id_idx" ON "RoutineSlot"("class_id");

-- CreateIndex
CREATE INDEX "RoutineSlot_section_id_idx" ON "RoutineSlot"("section_id");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_user_id_idx" ON "PushSubscription"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Guardian_user_id_key" ON "Guardian"("user_id");

-- AddForeignKey
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineSlot" ADD CONSTRAINT "RoutineSlot_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineSlot" ADD CONSTRAINT "RoutineSlot_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineSlot" ADD CONSTRAINT "RoutineSlot_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

