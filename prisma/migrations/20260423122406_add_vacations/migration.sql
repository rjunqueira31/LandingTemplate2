-- AlterTable
ALTER TABLE "User" ADD COLUMN     "vacationDays" INTEGER NOT NULL DEFAULT 22;

-- CreateTable
CREATE TABLE "Vacation" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'booked',

    CONSTRAINT "Vacation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vacation_userId_idx" ON "Vacation"("userId");

-- CreateIndex
CREATE INDEX "Vacation_date_idx" ON "Vacation"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Vacation_userId_date_key" ON "Vacation"("userId", "date");

-- AddForeignKey
ALTER TABLE "Vacation" ADD CONSTRAINT "Vacation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
