-- CreateEnum
CREATE TYPE "ExpiryScope" AS ENUM ('PILOTS', 'STUDENTS', 'INSTRUCTORS', 'ALL');

-- CreateTable
CREATE TABLE "ExpiryType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "ExpiryScope" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpiryType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpiryType_name_key" ON "ExpiryType"("name");

