-- AlterEnum (story 4.4, Task 1 — additive only; the new value is used
-- exclusively at runtime, never within this migration/transaction)
ALTER TYPE "AccountMovementType" ADD VALUE 'PACKAGE_PURCHASE';

-- CreateTable
CREATE TABLE "HourPackage" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "packageTypeId" TEXT NOT NULL,
    "includedMinutes" INTEGER NOT NULL,
    "pricePaidCents" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "expiresAt" DATE,
    "accountMovementId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HourPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HourPackage_accountMovementId_key" ON "HourPackage"("accountMovementId");

-- CreateIndex
CREATE INDEX "HourPackage_personId_idx" ON "HourPackage"("personId");

-- CreateIndex
CREATE INDEX "HourPackage_packageTypeId_idx" ON "HourPackage"("packageTypeId");

-- AddForeignKey
ALTER TABLE "HourPackage" ADD CONSTRAINT "HourPackage_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HourPackage" ADD CONSTRAINT "HourPackage_packageTypeId_fkey" FOREIGN KEY ("packageTypeId") REFERENCES "PackageType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HourPackage" ADD CONSTRAINT "HourPackage_accountMovementId_fkey" FOREIGN KEY ("accountMovementId") REFERENCES "AccountMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HourPackage" ADD CONSTRAINT "HourPackage_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
