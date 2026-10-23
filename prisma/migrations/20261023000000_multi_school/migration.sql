-- SeatSnipe multi-school: every watch and seat event belongs to a school, and a
-- student picks theirs before their first watch. Existing rows are all GSU.
-- IF [NOT] EXISTS keeps a partly applied run safe to repeat.

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "school" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingWatchQuery" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingWatchAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Watch" ADD COLUMN IF NOT EXISTS "school" TEXT NOT NULL DEFAULT 'gsu';

-- AlterTable
ALTER TABLE "SeatEvent" ADD COLUMN IF NOT EXISTS "school" TEXT NOT NULL DEFAULT 'gsu';

-- Swap the unique key to include school (new one first, so there's no window without one)
CREATE UNIQUE INDEX IF NOT EXISTS "Watch_userId_school_term_crn_key" ON "Watch"("userId", "school", "term", "crn");
DROP INDEX IF EXISTS "Watch_userId_term_crn_key";

-- Everyone who has used SeatSnipe so far is a GSU student, so they aren't asked again
UPDATE "User" SET "school" = 'gsu'
WHERE "school" IS NULL AND "id" IN (SELECT DISTINCT "userId" FROM "Watch");
