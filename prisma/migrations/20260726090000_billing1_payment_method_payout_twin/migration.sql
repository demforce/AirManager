-- Story Billing-1 (Fondamenta), AC 1/AC 4.
--
-- AC 1: `CashMovement.paymentMethod` — additive, nullable (historical rows
-- keep `NULL`, meaning "not attributed", resolved by the Billing-2 UI).
-- Backfill (deterministic, this same migration): every top-up's automatic
-- cash twin (linked via `accountMovementId` to a TOP_UP `AccountMovement`,
-- under the seeded "Ricariche" category) inherits its `paymentMethod` from
-- that `AccountMovement` — every other CashMovement stays NULL.
--
-- AC 4: `CashMovement.instructorPayoutId` — the traceability link for the
-- new "Compensi istruttori" money twin `recordPayout` creates (same
-- `accountMovementId @unique` twin pattern already established).

-- AlterTable
ALTER TABLE "CashMovement" ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "instructorPayoutId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_instructorPayoutId_key" ON "CashMovement"("instructorPayoutId");

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_instructorPayoutId_fkey" FOREIGN KEY ("instructorPayoutId") REFERENCES "InstructorPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: top-up cash twins inherit their payment method from the linked
-- AccountMovement (AC 1) — every other CashMovement (manual entries, PPR
-- landing fees, package-purchase twins, ...) stays NULL.
UPDATE "CashMovement" cm
SET "paymentMethod" = am."paymentMethod"
FROM "AccountMovement" am, "CashCategory" cc
WHERE cm."accountMovementId" = am.id
  AND cm."categoryId" = cc.id
  AND cc.name = 'Ricariche';
