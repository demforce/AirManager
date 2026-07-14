-- Hand-written (TD-2 pattern, story 12.2) — split from the companion
-- migration `20260714090000_booking_approval_workflow` in this same pair:
-- PG16 refuses to reference an enum value inside the transaction that
-- ADDed it ("unsafe use of new value 'PENDING' of enum type
-- BookingStatus ... must be committed before they can be used"), verified
-- empirically against this project's DB. This file runs AFTER that one
-- commits, so "PENDING" is now a committed label and safe to use as the
-- column's new default (`bookings.service.ts#createBooking` always stamps
-- the status explicitly regardless — story 12.2 AC 2 — this default is
-- schema coherence only, same rationale as `schema.prisma`'s own
-- doc-comment on `Booking.status`).

-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'PENDING';
