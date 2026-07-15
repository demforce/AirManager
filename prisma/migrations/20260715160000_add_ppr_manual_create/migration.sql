-- Epic 12, story 12.4, AC 1 — additive, hand-written (no destructive change,
-- no data migration needed: every existing row already has a non-null
-- `email`, so relaxing the NOT NULL constraint is a no-op for them).

-- AlterTable
ALTER TABLE "PprRequest" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "PprRequest" ADD COLUMN     "createdByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "PprRequest" ADD CONSTRAINT "PprRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
