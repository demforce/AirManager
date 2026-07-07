-- AlterEnum
ALTER TYPE "AccountMovementType" ADD VALUE 'FLIGHT_CHARGE_REVERSAL';

-- AlterTable
ALTER TABLE "Flight" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "correctionOfId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Flight_correctionOfId_key" ON "Flight"("correctionOfId");

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_correctionOfId_fkey" FOREIGN KEY ("correctionOfId") REFERENCES "Flight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

