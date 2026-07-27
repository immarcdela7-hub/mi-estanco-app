-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('SOLICITADA', 'CONFIRMADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "OwnActivity" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "province" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'culture',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "pricePerPerson" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ntlMarginPct" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "durationMin" INTEGER NOT NULL DEFAULT 90,
    "minPeople" INTEGER NOT NULL DEFAULT 1,
    "capacity" INTEGER NOT NULL DEFAULT 10,
    "slots" TEXT NOT NULL DEFAULT '',
    "weekdays" TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',
    "leadHours" INTEGER NOT NULL DEFAULT 24,
    "horizonDays" INTEGER NOT NULL DEFAULT 60,
    "meetingPoint" TEXT NOT NULL DEFAULT '',
    "supplierName" TEXT NOT NULL DEFAULT '',
    "supplierEmail" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" SERIAL NOT NULL,
    "reference" TEXT NOT NULL,
    "activityId" INTEGER NOT NULL,
    "establishmentId" INTEGER,
    "refCode" TEXT NOT NULL DEFAULT '',
    "bookingDate" DATE NOT NULL,
    "slot" TEXT NOT NULL DEFAULT '',
    "people" INTEGER NOT NULL DEFAULT 1,
    "amountTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "locale" TEXT NOT NULL DEFAULT 'es',
    "status" "BookingStatus" NOT NULL DEFAULT 'SOLICITADA',
    "saleId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnActivity_slug_key" ON "OwnActivity"("slug");

-- CreateIndex
CREATE INDEX "OwnActivity_active_idx" ON "OwnActivity"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_saleId_key" ON "Booking"("saleId");

-- CreateIndex
CREATE INDEX "Booking_activityId_bookingDate_idx" ON "Booking"("activityId", "bookingDate");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_establishmentId_idx" ON "Booking"("establishmentId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "OwnActivity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

