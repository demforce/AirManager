-- Story 16.5 (R-16-d, R-16-k, AD-11): the instructor's PAYOUT rate and the
-- compensation each flight accrues, frozen on the flight like every other
-- rate of the domain.

-- AlterTable
ALTER TABLE "Flight" ADD COLUMN     "instructorPayoutCents" INTEGER,
ADD COLUMN     "instructorPayoutRateCents" INTEGER;

-- Backfill: every flight WITH an instructor gets that instructor's payout
-- rate of TODAY (R-16-d: the mutable column has no history to recover), `0`
-- when the instructor has none (R-16-k: no rate means nothing accrued, never
-- NULL), and the amount with the SAME rule as `src/lib/money.ts#centsForMinutes`
-- — `round((rate * minutes) / 60)`, on `numeric`, which rounds half away from
-- zero exactly like `Math.round` on these non-negative values. A flight
-- without an instructor keeps NULL on both columns.
UPDATE "Flight" f
SET "instructorPayoutRateCents" = COALESCE(ip."payoutRateCents", 0),
    "instructorPayoutCents" = (round((COALESCE(ip."payoutRateCents", 0)::numeric * f.minutes) / 60))::int
FROM "InstructorProfile" ip
WHERE f."instructorProfileId" = ip.id;
