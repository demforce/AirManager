ALTER TYPE "AuthTokenType" ADD VALUE 'CHANGE_EMAIL_CURRENT';
ALTER TYPE "AuthTokenType" ADD VALUE 'CHANGE_EMAIL_NEW';
ALTER TABLE "CredentialMail" ADD COLUMN "candidateBox" TEXT;
CREATE INDEX "CredentialMail_candidate_expiry" ON "CredentialMail" ("expiresAt") WHERE "candidateBox" IS NOT NULL;
ALTER TABLE "EmailVerification" ADD COLUMN "addressChangedAt" TIMESTAMP(3);

-- Also covers invalidation by the existing account identity trigger.
CREATE FUNCTION discard_credential_candidate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."revokedAt" IS NOT NULL OR NEW.state IN ('SUPPRESSED','EXPIRED','EXHAUSTED','PERMANENT') THEN
    NEW."candidateBox" := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER credential_candidate_retention BEFORE UPDATE OF "revokedAt", state ON "CredentialMail"
  FOR EACH ROW WHEN (OLD."candidateBox" IS NOT NULL) EXECUTE FUNCTION discard_credential_candidate();
