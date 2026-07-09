-- AlterTable
ALTER TABLE "CashMovement" ADD COLUMN     "pprRequestId" TEXT;

-- AlterTable
ALTER TABLE "PprRequest" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedByUserId" TEXT,
ADD COLUMN     "landingFeeCents" INTEGER;

-- CreateIndex
CREATE INDEX "CashMovement_pprRequestId_idx" ON "CashMovement"("pprRequestId");

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_pprRequestId_fkey" FOREIGN KEY ("pprRequestId") REFERENCES "PprRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PprRequest" ADD CONSTRAINT "PprRequest_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
