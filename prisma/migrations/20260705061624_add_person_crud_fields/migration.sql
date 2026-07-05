-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "address" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "fiscalCode" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Person_fiscalCode_key" ON "Person"("fiscalCode");

