-- AlterTable
ALTER TABLE "User" ADD COLUMN "locationToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_locationToken_key" ON "User"("locationToken");

-- CreateTable
CREATE TABLE "LocationReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "persistent" BOOLEAN NOT NULL DEFAULT false,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "lastFiredAt" TIMESTAMP(3),
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 120,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationReminder_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LocationReminder" ADD CONSTRAINT "LocationReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
