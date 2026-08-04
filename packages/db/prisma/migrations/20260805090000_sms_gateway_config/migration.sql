-- CreateEnum
CREATE TYPE "SmsGatewayProvider" AS ENUM ('SSL_WIRELESS', 'BULKSMSBD', 'OTHER');

-- CreateTable
CREATE TABLE "SmsGatewayConfig" (
    "id" TEXT NOT NULL,
    "provider" "SmsGatewayProvider" NOT NULL,
    "api_key" TEXT,
    "api_secret" TEXT,
    "sender_id" TEXT,
    "api_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsGatewayConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsGatewayConfig_provider_key" ON "SmsGatewayConfig"("provider");

