-- CreateEnum
CREATE TYPE "PaymentGatewayProvider" AS ENUM ('BKASH', 'NAGAD', 'SSLCOMMERZ', 'ROCKET');

-- CreateTable
CREATE TABLE "PaymentGatewayConfig" (
    "id" TEXT NOT NULL,
    "provider" "PaymentGatewayProvider" NOT NULL,
    "app_key" TEXT,
    "app_secret" TEXT,
    "username" TEXT,
    "password" TEXT,
    "sandbox_mode" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentGatewayConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentGatewayConfig_provider_key" ON "PaymentGatewayConfig"("provider");
