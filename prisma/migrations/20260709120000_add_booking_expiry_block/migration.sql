-- AlterTable
ALTER TABLE "ExpiryType" ADD COLUMN     "blocksBooking" BOOLEAN NOT NULL DEFAULT false;

-- Backfill (story 7.4 Contesto): the 4 standard blocking types, by the EXACT
-- names the seed (`STANDARD_EXPIRY_TYPES`) uses — medica/licenza block a
-- booking when expired; ratings (SEP, ICAO) only warn.
UPDATE "ExpiryType" SET "blocksBooking" = true WHERE "name" IN ('Visita medica classe 1', 'Visita medica classe 2', 'Visita medica LAPL', 'Licenza');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "forcedAt" TIMESTAMP(3),
ADD COLUMN     "forcedByUserId" TEXT,
ADD COLUMN     "forceReason" TEXT;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_forcedByUserId_fkey" FOREIGN KEY ("forcedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
