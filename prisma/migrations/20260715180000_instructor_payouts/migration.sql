-- AlterTable
ALTER TABLE "InstructorProfile" ADD COLUMN     "payoutRateCents" INTEGER;

-- CreateTable
CREATE TABLE "InstructorPayout" (
    "id" TEXT NOT NULL,
    "instructorProfileId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "notes" TEXT,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstructorPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstructorPayout_instructorProfileId_periodEnd_idx" ON "InstructorPayout"("instructorProfileId", "periodEnd");

-- AddForeignKey
ALTER TABLE "InstructorPayout" ADD CONSTRAINT "InstructorPayout_instructorProfileId_fkey" FOREIGN KEY ("instructorProfileId") REFERENCES "InstructorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorPayout" ADD CONSTRAINT "InstructorPayout_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
