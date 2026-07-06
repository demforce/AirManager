-- CreateTable
CREATE TABLE "PilotProfile" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "licenseType" TEXT NOT NULL,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PilotProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "courseStartDate" DATE NOT NULL,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstructorProfile" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "ratings" TEXT NOT NULL,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstructorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PilotProfile_personId_key" ON "PilotProfile"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_personId_key" ON "StudentProfile"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "InstructorProfile_personId_key" ON "InstructorProfile"("personId");

-- AddForeignKey
ALTER TABLE "PilotProfile" ADD CONSTRAINT "PilotProfile_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorProfile" ADD CONSTRAINT "InstructorProfile_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

