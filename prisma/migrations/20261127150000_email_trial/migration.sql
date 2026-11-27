ALTER TYPE "AuthTokenType" ADD VALUE 'VERIFY_EMAIL';
ALTER TYPE "AuthTokenType" ADD VALUE 'LOGIN_LINK';
CREATE TABLE "EmailVerification" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "email" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3)
);
CREATE TABLE "EmailTrialRequest" (
  "id" TEXT PRIMARY KEY,
  "identity" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "EmailTrialRequest_identity_createdAt_idx" ON "EmailTrialRequest" ("identity", "createdAt");
CREATE INDEX "EmailTrialRequest_origin_createdAt_idx" ON "EmailTrialRequest" ("origin", "createdAt");
CREATE INDEX "EmailTrialRequest_createdAt_idx" ON "EmailTrialRequest" ("createdAt");
CREATE INDEX "CredentialMail_purpose_createdAt_idx" ON "CredentialMail" ("purpose", "createdAt");
