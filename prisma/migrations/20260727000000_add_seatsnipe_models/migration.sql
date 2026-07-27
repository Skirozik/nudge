-- CreateEnum
CREATE TYPE "WatchStatus" AS ENUM ('ACTIVE', 'PAUSED', 'FULFILLED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "source" TEXT;

-- CreateTable
CREATE TABLE "Watch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "crn" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "sectionLabel" TEXT,
    "status" "WatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSeats" INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3),
    "alertCount" INTEGER NOT NULL DEFAULT 0,
    "lastAlertAt" TIMESTAMP(3),
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatEvent" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "crn" TEXT NOT NULL,
    "seatsFrom" INTEGER NOT NULL,
    "seatsTo" INTEGER NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeatEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "userId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Watch_userId_term_crn_key" ON "Watch"("userId", "term", "crn");

-- AddForeignKey
ALTER TABLE "Watch" ADD CONSTRAINT "Watch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
