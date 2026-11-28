BEGIN;
ALTER TABLE "EmailVerification" ADD COLUMN "expiryStartCycle" integer;

-- An existing proof has a real timestamp but no historical sequence reading.
-- Store one upgrade watermark, shared by all such proofs. Any later registration
-- or renewal draws a larger sequence number. Leave addresses and proof dates intact.
WITH upgrade AS MATERIALIZED (
  SELECT nextval('"Expiry_notificationCycle_seq"')::integer AS cycle
)
UPDATE "EmailVerification" proof SET "expiryStartCycle" = upgrade.cycle
FROM upgrade WHERE proof."verifiedAt" IS NOT NULL;
COMMIT;
