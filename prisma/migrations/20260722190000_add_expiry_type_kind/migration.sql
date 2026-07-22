-- Hand-written (TD-2 pattern, story 13.1, AC 1): `ExpiryType` gains a
-- RATING/MEDICAL `kind` (R-13.1-a). This is a brand-new enum type
-- (`CREATE TYPE`), not an `ALTER TYPE ... ADD VALUE` on an existing one —
-- the PG16 "unsafe use of new enum value" restriction that forced 12.2's
-- migration split (`20260714090000_booking_approval_workflow` ->
-- `...0001_...default`) does NOT apply here, verified empirically against
-- this project's DB: `ADD COLUMN ... DEFAULT 'RATING'` referencing a
-- freshly CREATEd type in the SAME transaction works.
--
-- Data migration: mark the 3 medical-visit standard types MEDICAL, by their
-- EXACT seed names (`prisma/seed.ts`'s `STANDARD_EXPIRY_TYPES`, verified
-- against that file, same exact-name convention as the `blocksBooking`
-- backfill in `20260717165337_add_expiry_type_validity_months`'s sibling
-- `20260709120000_add_booking_expiry_block`). The `Expiry` rows already
-- registered against these types are untouched (R-13.1-a: no data loss,
-- they keep referencing the SAME `expiryTypeId`).

-- CreateEnum
CREATE TYPE "ExpiryTypeKind" AS ENUM ('RATING', 'MEDICAL');

-- AlterTable
ALTER TABLE "ExpiryType" ADD COLUMN     "kind" "ExpiryTypeKind" NOT NULL DEFAULT 'RATING';

-- Backfill: the 3 standard medical-visit types, by exact seed name.
UPDATE "ExpiryType" SET "kind" = 'MEDICAL' WHERE "name" IN ('Visita medica classe 1', 'Visita medica classe 2', 'Visita medica LAPL');
