-- CreateTable
CREATE TABLE "TrainingNote" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "instructorProfileId" TEXT NOT NULL,
    "noteDate" DATE NOT NULL,
    "flightId" TEXT,
    "exercises" TEXT NOT NULL,
    "assessment" TEXT,
    "nextSteps" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingNote_studentProfileId_noteDate_idx" ON "TrainingNote"("studentProfileId", "noteDate");

-- AddForeignKey
ALTER TABLE "TrainingNote" ADD CONSTRAINT "TrainingNote_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingNote" ADD CONSTRAINT "TrainingNote_instructorProfileId_fkey" FOREIGN KEY ("instructorProfileId") REFERENCES "InstructorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingNote" ADD CONSTRAINT "TrainingNote_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE SET NULL ON UPDATE CASCADE;
