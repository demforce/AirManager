-- CreateTable
CREATE TABLE "CredentialMail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "AuthTokenType" NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'QUEUED',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "tokenId" TEXT,
    "attemptId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "operatorId" TEXT,
    "actionKey" TEXT,

    CONSTRAINT "CredentialMail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailAttempt" (
    "id" TEXT NOT NULL,
    "intentId" TEXT,
    "origin" TEXT NOT NULL,
    "config" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "phase" TEXT NOT NULL,
    "outcome" TEXT,
    "smtpCode" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MailAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailChannel" (
    "id" INTEGER NOT NULL,
    "config" INTEGER NOT NULL DEFAULT 1,
    "mode" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "probeId" TEXT,
    "probeAfter" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "manual" JSONB,
    "automatic" JSONB,

    CONSTRAINT "MailChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CredentialMail_state_nextAt_idx" ON "CredentialMail"("state", "nextAt");

-- CreateIndex
CREATE INDEX "CredentialMail_userId_purpose_createdAt_idx" ON "CredentialMail"("userId", "purpose", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CredentialMail_operatorId_userId_purpose_actionKey_key" ON "CredentialMail"("operatorId", "userId", "purpose", "actionKey");

-- CreateIndex
CREATE INDEX "MailAttempt_finishedAt_leaseUntil_idx" ON "MailAttempt"("finishedAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "MailAttempt_startedAt_idx" ON "MailAttempt"("startedAt");

-- AddForeignKey
ALTER TABLE "CredentialMail" ADD CONSTRAINT "CredentialMail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailAttempt" ADD CONSTRAINT "MailAttempt_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "CredentialMail"("id") ON DELETE CASCADE ON UPDATE CASCADE;


INSERT INTO "MailChannel" ("id") VALUES (1);

-- Each settings write path, including the atomic multi-card save, shares this revision.
CREATE FUNCTION bump_smtp_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(NEW.key, OLD.key) IN ('smtp.host','smtp.port','smtp.security','smtp.user','smtp.pass','smtp.from')
     AND (TG_OP <> 'UPDATE' OR NEW.value IS DISTINCT FROM OLD.value) THEN
    UPDATE "MailChannel" SET "config" = "config" + 1, "probeId" = NULL,
      "mode" = CASE WHEN mode = 'ACTIVE' THEN 'ACTIVE' ELSE 'PAUSED' END,
      "probeAfter" = clock_timestamp(), "failures" = 0 WHERE id = 1;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER smtp_config_revision AFTER INSERT OR UPDATE OR DELETE ON "AppSetting"
  FOR EACH ROW EXECUTE FUNCTION bump_smtp_revision();

-- Invalidate credentials under the same account row lock as the identity change.
-- An already-started handoff keeps its transport observation independently of revocation.
CREATE FUNCTION invalidate_credential_mail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email OR (OLD."isActive" AND NOT NEW."isActive")
     OR NEW."passwordHash" IS DISTINCT FROM OLD."passwordHash" THEN
    UPDATE "AuthToken" SET "usedAt" = clock_timestamp()
      WHERE "usedAt" IS NULL AND id IN (SELECT "tokenId" FROM "CredentialMail"
      WHERE "userId" = NEW.id AND "revokedAt" IS NULL);
    UPDATE "CredentialMail" SET "revokedAt" = clock_timestamp(),
      state = CASE WHEN state IN ('QUEUED','CLAIMED') THEN 'SUPPRESSED' ELSE state END,
      "observedAt" = CASE WHEN state IN ('QUEUED','CLAIMED') THEN clock_timestamp() ELSE "observedAt" END
      WHERE "userId" = NEW.id AND "revokedAt" IS NULL;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER credential_mail_identity AFTER UPDATE OF email, "isActive", "passwordHash" ON "User"
  FOR EACH ROW EXECUTE FUNCTION invalidate_credential_mail();
