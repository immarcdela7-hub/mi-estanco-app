-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('INGRESO', 'GASTO');

-- CreateTable
CREATE TABLE "Invoice" (
    "id" SERIAL NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "number" TEXT NOT NULL DEFAULT '',
    "issueDate" DATE NOT NULL,
    "counterparty" TEXT NOT NULL DEFAULT '',
    "selfBilled" BOOLEAN NOT NULL DEFAULT false,
    "concept" TEXT NOT NULL DEFAULT '',
    "base" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "vatPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fileName" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL DEFAULT 'application/pdf',
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "storedName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL DEFAULT '',
    "establishmentId" INTEGER,
    "saleId" INTEGER,
    "payoutId" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_storedName_key" ON "Invoice"("storedName");

-- CreateIndex
CREATE INDEX "Invoice_kind_issueDate_idx" ON "Invoice"("kind", "issueDate");

-- CreateIndex
CREATE INDEX "Invoice_establishmentId_idx" ON "Invoice"("establishmentId");

-- CreateIndex
CREATE INDEX "Invoice_sha256_idx" ON "Invoice"("sha256");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

