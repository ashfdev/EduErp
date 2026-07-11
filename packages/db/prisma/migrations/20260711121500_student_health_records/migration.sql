-- CreateTable
CREATE TABLE "StudentHealthProfile" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "allergies" TEXT,
    "chronic_conditions" TEXT,
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentHealthProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthIncident" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "action_taken" TEXT,
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentHealthProfile_student_id_key" ON "StudentHealthProfile"("student_id");

-- CreateIndex
CREATE INDEX "HealthIncident_student_id_idx" ON "HealthIncident"("student_id");

-- AddForeignKey
ALTER TABLE "StudentHealthProfile" ADD CONSTRAINT "StudentHealthProfile_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthIncident" ADD CONSTRAINT "HealthIncident_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

