-- AlterTable
ALTER TABLE "Flight" ADD COLUMN     "forceReason" TEXT,
ADD COLUMN     "forcedAt" TIMESTAMP(3),
ADD COLUMN     "forcedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_forcedByUserId_fkey" FOREIGN KEY ("forcedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
