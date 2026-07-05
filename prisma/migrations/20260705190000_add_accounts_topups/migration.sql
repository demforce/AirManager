-- CreateEnum
CREATE TYPE "AccountMovementType" AS ENUM ('TOP_UP');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'POS');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountMovement" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "AccountMovementType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod",
    "description" TEXT,
    "effectiveDate" DATE NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT,
    "effectiveDate" DATE NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "accountMovementId" TEXT,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_personId_key" ON "Account"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountMovement_reversalOfId_key" ON "AccountMovement"("reversalOfId");

-- CreateIndex
CREATE INDEX "AccountMovement_accountId_idx" ON "AccountMovement"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "CashCategory_name_key" ON "CashCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_accountMovementId_key" ON "CashMovement"("accountMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_reversalOfId_key" ON "CashMovement"("reversalOfId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMovement" ADD CONSTRAINT "AccountMovement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMovement" ADD CONSTRAINT "AccountMovement_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMovement" ADD CONSTRAINT "AccountMovement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "AccountMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CashCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_accountMovementId_fkey" FOREIGN KEY ("accountMovementId") REFERENCES "AccountMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "CashMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

