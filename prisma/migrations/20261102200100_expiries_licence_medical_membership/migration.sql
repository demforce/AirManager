-- Hand-written (TD-2 pattern), story 19.7a (CR PO 2026-11-01): data-only, no DDL — the catalogue
-- invariants it establishes are kept from here on by expiry-types.service.ts and the seeds.
--   R-19-k: "Licenza" is no longer an expiry (the licence stays PilotProfile.licenseType); the
--           membership fee is its own MEMBERSHIP kind (value added by the previous migration).
--   R-19-j: medical visits have no scope — any valid visit of any class covers whoever is on board.
--   R-19-a: test data only, destructive statements ratified.
-- Exact names, never substrings (a custom type containing "licenz" must survive) — same exact-name
-- convention as 20260709120000_add_booking_expiry_block and 20260722190000_add_expiry_type_kind.
BEGIN;

-- 1. Licence is no longer an expiry (R-19-k): rows first (their ExpiryUpdateProposal and SentAlert
--    rows go with them, ON DELETE CASCADE), then the type (Expiry.expiryTypeId is RESTRICT).
DELETE FROM "Expiry" WHERE "expiryTypeId" IN (SELECT "id" FROM "ExpiryType" WHERE "name" = 'Licenza');
DELETE FROM "ExpiryType" WHERE "name" = 'Licenza';

-- 2. Medical visits have no scope and always count toward the requirement (R-19-j, D-3).
UPDATE "ExpiryType" SET "scope" = 'ALL', "blocksBooking" = true WHERE "kind" = 'MEDICAL';

-- 3. The membership fee is its own kind (R-19-k, D-1), never a per-type blocking document.
UPDATE "ExpiryType" SET "kind" = 'MEMBERSHIP', "scope" = 'ALL', "blocksBooking" = false, "isActive" = true WHERE "name" = 'Quota associativa';

COMMIT;
