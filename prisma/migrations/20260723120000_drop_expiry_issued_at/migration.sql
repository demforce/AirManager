-- Hand-written (TD-2 pattern, story 13.1 review fix R6 — PO ratifica
-- 2026-07-23): drops `Expiry.issuedAt`. The issue date turned out to have
-- no domain meaning of its own — nothing reads it to derive a decision
-- (status is derived from `expiresAt` alone, `computeExpiryStatus`), and its
-- ONLY behavioural effect was a cross-field guard (`expiresAt >= issuedAt`)
-- that the one-step composite create (story 13.1, AC 5) forgot to apply,
-- letting an inconsistent row through where the standalone `POST
-- /api/v1/expiries` would have rejected it (review F1). Removing the
-- column removes the inconsistency at the root: an already-expired scadenza
-- is simply legal to register (it is the real state of the world, same
-- stance the pre-existing `registerExpiry` doc-comment already took for
-- `expiresAt` itself), for every entry point alike.
--
-- No data migration: the existing `issuedAt` values carried no meaning that
-- needs preserving elsewhere (nothing else reads them).

-- AlterTable
ALTER TABLE "Expiry" DROP COLUMN "issuedAt";
