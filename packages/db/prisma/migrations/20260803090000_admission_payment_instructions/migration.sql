-- CreateTable
CREATE TABLE "AdmissionPaymentInstructions" (
    "id" TEXT NOT NULL,
    "bkash_number" TEXT,
    "nagad_number" TEXT,
    "rocket_number" TEXT,
    "bank_name" TEXT,
    "bank_account_name" TEXT,
    "bank_account_number" TEXT,
    "bank_routing_number" TEXT,
    "note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionPaymentInstructions_pkey" PRIMARY KEY ("id")
);

