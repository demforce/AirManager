-- Story 19.9 (CR PO 2026-11-01, R-19-h, A10): the deroga of the requirements warning carries no motivo
-- and shows no badge; only the silent stamp "forcedAt"/"forcedByUserId" stays. The flights' motivo goes
-- (destructive by ratification: test data only). "Booking"."forceReason" is story 19.10's.
ALTER TABLE "Flight" DROP COLUMN "forceReason";
