-- AlterTable
ALTER TABLE "OtpCode" ADD COLUMN     "failedAttempts" INTEGER NOT NULL DEFAULT 0;
