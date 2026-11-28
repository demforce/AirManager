-- Story 19.7a (CR PO 2026-11-01, R-19-k): the membership fee becomes its own expiry-type kind.
-- ONLY the new enum value here: PG16 refuses to use a value ADDed in the same transaction ("unsafe
-- use of new value ... New enum values must be committed before they can be used" — reproduced on
-- the story's twin DB with both statements in one transaction), and a migration file runs as one
-- transaction — the data migration that uses 'MEMBERSHIP' is the NEXT file
-- (20261102200100_expiries_licence_medical_membership). Same split as story 12.2
-- (20260714090000_booking_approval_workflow -> its _default sibling).

-- AlterEnum
ALTER TYPE "ExpiryTypeKind" ADD VALUE 'MEMBERSHIP';
