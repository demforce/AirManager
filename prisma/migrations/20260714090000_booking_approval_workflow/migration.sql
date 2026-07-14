-- Hand-written (TD-2 pattern, story 12.2): the booking approval workflow
-- renames the old "ACTIVE" enum value to "APPROVED" (every existing row
-- migrates in-place, transactionally — same `ALTER TYPE ... RENAME VALUE`
-- precedent as `20260710120000_rename_flight_types_add_solo_flag`; no
-- index/constraint references the enum's text values, verified) and adds
-- "PENDING"/"DENIED"/"FLOWN"/"NO_SHOW". The column's new DEFAULT
-- ("PENDING" — a pilot/instructor self-booking now starts unapproved,
-- story 12.2 AC 2) is set in the FOLLOWING migration file, NOT here: PG16
-- rejects referencing a just-ADDed enum value inside the SAME transaction
-- that added it ("unsafe use of new value ... must be committed before
-- they can be used"), verified empirically against this project's DB — so
-- `ADD VALUE` and a `SET DEFAULT` that depends on it cannot share one file.

-- RenameEnumValue
ALTER TYPE "BookingStatus" RENAME VALUE 'ACTIVE' TO 'APPROVED';

-- AddEnumValue
ALTER TYPE "BookingStatus" ADD VALUE 'PENDING';
ALTER TYPE "BookingStatus" ADD VALUE 'DENIED';
ALTER TYPE "BookingStatus" ADD VALUE 'FLOWN';
ALTER TYPE "BookingStatus" ADD VALUE 'NO_SHOW';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedByUserId" TEXT,
ADD COLUMN     "denyReason" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
