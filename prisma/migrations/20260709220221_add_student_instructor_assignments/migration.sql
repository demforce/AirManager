-- CreateTable
CREATE TABLE "StudentInstructorAssignment" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "instructorProfileId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentInstructorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentInstructorAssignment_studentProfileId_instructorProf_key" ON "StudentInstructorAssignment"("studentProfileId", "instructorProfileId");

-- AddForeignKey
ALTER TABLE "StudentInstructorAssignment" ADD CONSTRAINT "StudentInstructorAssignment_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentInstructorAssignment" ADD CONSTRAINT "StudentInstructorAssignment_instructorProfileId_fkey" FOREIGN KEY ("instructorProfileId") REFERENCES "InstructorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentInstructorAssignment" ADD CONSTRAINT "StudentInstructorAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
