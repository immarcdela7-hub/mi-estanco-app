-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "groupOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "groupRef" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "Booking_groupRef_idx" ON "Booking"("groupRef");

