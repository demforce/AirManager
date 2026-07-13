-- AlterTable
ALTER TABLE "Flight" ADD COLUMN     "balanceForceReason" TEXT,
ADD COLUMN     "balanceForcedAt" TIMESTAMP(3),
ADD COLUMN     "balanceForcedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_balanceForcedByUserId_fkey" FOREIGN KEY ("balanceForcedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
