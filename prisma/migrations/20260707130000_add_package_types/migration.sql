-- CreateTable
CREATE TABLE "PackageType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "includedMinutes" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "validityMonths" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageTypeAircraft" (
    "id" TEXT NOT NULL,
    "packageTypeId" TEXT NOT NULL,
    "aircraftId" TEXT NOT NULL,

    CONSTRAINT "PackageTypeAircraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PackageType_name_key" ON "PackageType"("name");

-- CreateIndex
CREATE INDEX "PackageTypeAircraft_aircraftId_idx" ON "PackageTypeAircraft"("aircraftId");

-- CreateIndex
CREATE UNIQUE INDEX "PackageTypeAircraft_packageTypeId_aircraftId_key" ON "PackageTypeAircraft"("packageTypeId", "aircraftId");

-- AddForeignKey
ALTER TABLE "PackageTypeAircraft" ADD CONSTRAINT "PackageTypeAircraft_packageTypeId_fkey" FOREIGN KEY ("packageTypeId") REFERENCES "PackageType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageTypeAircraft" ADD CONSTRAINT "PackageTypeAircraft_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

