-- CreateEnum
CREATE TYPE "ExpiryProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Expiry" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "expiryTypeId" TEXT NOT NULL,
    "issuedAt" DATE NOT NULL,
    "expiresAt" DATE NOT NULL,
    "notes" TEXT,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpiryUpdateProposal" (
    "id" TEXT NOT NULL,
    "expiryId" TEXT NOT NULL,
    "proposedIssuedAt" DATE NOT NULL,
    "proposedExpiresAt" DATE NOT NULL,
    "proposedNotes" TEXT,
    "status" "ExpiryProposalStatus" NOT NULL DEFAULT 'PENDING',
    "proposedByUserId" TEXT NOT NULL,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpiryUpdateProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expiry_expiryTypeId_idx" ON "Expiry"("expiryTypeId");

-- CreateIndex
CREATE INDEX "Expiry_expiresAt_idx" ON "Expiry"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Expiry_personId_expiryTypeId_key" ON "Expiry"("personId", "expiryTypeId");

-- CreateIndex
CREATE INDEX "ExpiryUpdateProposal_expiryId_idx" ON "ExpiryUpdateProposal"("expiryId");

-- CreateIndex
CREATE INDEX "ExpiryUpdateProposal_status_idx" ON "ExpiryUpdateProposal"("status");

-- AddForeignKey
ALTER TABLE "Expiry" ADD CONSTRAINT "Expiry_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expiry" ADD CONSTRAINT "Expiry_expiryTypeId_fkey" FOREIGN KEY ("expiryTypeId") REFERENCES "ExpiryType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expiry" ADD CONSTRAINT "Expiry_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpiryUpdateProposal" ADD CONSTRAINT "ExpiryUpdateProposal_expiryId_fkey" FOREIGN KEY ("expiryId") REFERENCES "Expiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpiryUpdateProposal" ADD CONSTRAINT "ExpiryUpdateProposal_proposedByUserId_fkey" FOREIGN KEY ("proposedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpiryUpdateProposal" ADD CONSTRAINT "ExpiryUpdateProposal_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-appended (Dev Notes, story 6.2 Task 1): the Prisma DSL cannot express
-- a partial/filtered unique index. This is the "at most one PENDING
-- proposal per Expiry" constraint (AC 2) — a plain @@unique([expiryId])
-- would forbid a second proposal even after the first was decided
-- (APPROVED/REJECTED), which must be legal (a titolare can propose again
-- after a rejection, or file a new renewal proposal later). A future
-- `prisma migrate diff` against schema.prisma will report drift for this
-- index alone — accepted, same tradeoff already made for FOR UPDATE-style
-- hand-written SQL elsewhere in this codebase.
CREATE UNIQUE INDEX "ExpiryUpdateProposal_expiryId_pending_key" ON "ExpiryUpdateProposal"("expiryId") WHERE "status" = 'PENDING';
