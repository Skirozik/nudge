-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "checkIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkInAt" TIMESTAMP(3);
