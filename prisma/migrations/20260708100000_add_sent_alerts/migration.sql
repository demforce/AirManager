-- CreateTable
CREATE TABLE "SentAlert" (
    "id" TEXT NOT NULL,
    "expiryId" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SentAlert_expiryId_threshold_key" ON "SentAlert"("expiryId", "threshold");

-- AddForeignKey
ALTER TABLE "SentAlert" ADD CONSTRAINT "SentAlert_expiryId_fkey" FOREIGN KEY ("expiryId") REFERENCES "Expiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
