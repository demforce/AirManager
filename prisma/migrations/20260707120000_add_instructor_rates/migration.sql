-- CreateTable
CREATE TABLE "InstructorRate" (
    "id" TEXT NOT NULL,
    "instructorProfileId" TEXT NOT NULL,
    "priceCentsPerHour" INTEGER NOT NULL,
    "validFrom" DATE NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstructorRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstructorRate_instructorProfileId_idx" ON "InstructorRate"("instructorProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "InstructorRate_instructorProfileId_validFrom_key" ON "InstructorRate"("instructorProfileId", "validFrom");

-- AddForeignKey
ALTER TABLE "InstructorRate" ADD CONSTRAINT "InstructorRate_instructorProfileId_fkey" FOREIGN KEY ("instructorProfileId") REFERENCES "InstructorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorRate" ADD CONSTRAINT "InstructorRate_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

