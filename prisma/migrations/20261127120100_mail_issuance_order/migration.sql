-- Database sequence orders serialised issuances and observations even within one millisecond.
ALTER TABLE "CredentialMail" ADD COLUMN "generation" BIGSERIAL NOT NULL;
CREATE UNIQUE INDEX "CredentialMail_generation_key" ON "CredentialMail"("generation");
ALTER TABLE "MailAttempt" ADD COLUMN "sequence" BIGSERIAL NOT NULL;
CREATE UNIQUE INDEX "MailAttempt_sequence_key" ON "MailAttempt"("sequence");
