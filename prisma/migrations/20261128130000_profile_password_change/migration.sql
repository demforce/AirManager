ALTER TYPE "AuthTokenType" ADD VALUE 'CHANGE_ADMIN_PASSWORD';
ALTER TABLE "CredentialMail" ADD COLUMN "expectedAdminPasswordVersion" INTEGER;
