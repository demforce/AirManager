-- AlterTable
ALTER TABLE "MailChannel" ADD COLUMN     "loginLinksPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loginPauseThrough" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "monitorAt" TIMESTAMP(3),
ADD COLUMN     "monitorStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "LoginVolume" (
    "minute" TIMESTAMP(3) NOT NULL,
    "requests" INTEGER NOT NULL,

    CONSTRAINT "LoginVolume_pkey" PRIMARY KEY ("minute")
);

-- CreateTable
CREATE TABLE "SecurityIncident" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "needsRecipients" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SecurityIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityDelivery" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "recipientFailures" INTEGER NOT NULL DEFAULT 0,
    "nextAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "attemptKey" TEXT,
    "reason" TEXT,
    "smtpCode" INTEGER,
    "config" INTEGER,

    CONSTRAINT "SecurityDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityIncident_kind_resolvedAt_idx" ON "SecurityIncident"("kind", "resolvedAt");

-- CreateIndex
CREATE INDEX "SecurityDelivery_state_nextAt_idx" ON "SecurityDelivery"("state", "nextAt");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityDelivery_incidentId_userId_key" ON "SecurityDelivery"("incidentId", "userId");

-- AddForeignKey
ALTER TABLE "SecurityDelivery" ADD CONSTRAINT "SecurityDelivery_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SecurityIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityDelivery" ADD CONSTRAINT "SecurityDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
