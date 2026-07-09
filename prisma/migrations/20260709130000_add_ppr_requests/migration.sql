-- CreateEnum
CREATE TYPE "PprStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PprRequest" (
    "id" TEXT NOT NULL,
    "status" "PprStatus" NOT NULL DEFAULT 'PENDING',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "aircraftRegistration" TEXT NOT NULL,
    "aircraftType" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "eta" TIMESTAMP(3) NOT NULL,
    "etd" TIMESTAMP(3),
    "personsOnBoard" INTEGER NOT NULL,
    "notes" TEXT,
    "locale" TEXT NOT NULL,
    "submitterIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PprRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PprRequest_submitterIp_createdAt_idx" ON "PprRequest"("submitterIp", "createdAt");
