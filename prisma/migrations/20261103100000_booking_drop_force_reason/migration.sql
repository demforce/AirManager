-- Story 19.10 (CR PO 2026-11-01, R-19-h, A10): the deroga of a booking's requirements warning carries no
-- motivo either — the same single pattern as the flights (story 19.9). Only the silent stamp
-- "forcedAt"/"forcedByUserId" stays, never shown. No backfill: the motivo is dropped (R-19-a, test data only).
ALTER TABLE "Booking" DROP COLUMN "forceReason";
