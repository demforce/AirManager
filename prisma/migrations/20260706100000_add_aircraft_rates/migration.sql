-- CreateTable
CREATE TABLE "AircraftRate" (
    "id" TEXT NOT NULL,
    "aircraftId" TEXT NOT NULL,
    "priceCentsPerHour" INTEGER NOT NULL,
    "validFrom" DATE NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AircraftRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AircraftRate_aircraftId_idx" ON "AircraftRate"("aircraftId");

-- CreateIndex
CREATE UNIQUE INDEX "AircraftRate_aircraftId_validFrom_key" ON "AircraftRate"("aircraftId", "validFrom");

-- AddForeignKey
ALTER TABLE "AircraftRate" ADD CONSTRAINT "AircraftRate_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AircraftRate" ADD CONSTRAINT "AircraftRate_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

