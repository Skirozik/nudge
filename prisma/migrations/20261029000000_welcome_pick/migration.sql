-- New numbers are asked "SeatSnipe or Nudge?" before anything else, and the
-- answer is kept on the user. Past users are never asked: they get a pick from
-- what they've already used, and nobody is texted.
-- IF NOT EXISTS keeps a partly applied run safe to repeat.

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "product" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboarding" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingHeld" TEXT;

-- Past users: SeatSnipe if they had a watch or picked a school, Nudge if they had
-- an assignment, a one-off reminder or a location reminder, both if both.
-- Users with neither keep no pick and are treated as before.
UPDATE "User" AS u
SET "product" = CASE
    WHEN h."seatsnipe" AND h."nudge" THEN 'both'
    WHEN h."seatsnipe" THEN 'seatsnipe'
    ELSE 'nudge'
  END
FROM (
  SELECT x."id",
    (x."school" IS NOT NULL
      OR EXISTS (SELECT 1 FROM "Watch" w WHERE w."userId" = x."id")) AS "seatsnipe",
    (EXISTS (SELECT 1 FROM "Assignment" a WHERE a."userId" = x."id")
      OR EXISTS (SELECT 1 FROM "OneOffReminder" o WHERE o."userId" = x."id")
      OR EXISTS (SELECT 1 FROM "LocationReminder" l WHERE l."userId" = x."id")) AS "nudge"
  FROM "User" AS x
) AS h
WHERE u."id" = h."id"
  AND u."product" IS NULL
  AND (h."seatsnipe" OR h."nudge");
