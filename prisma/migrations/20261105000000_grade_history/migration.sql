-- Grade history: one row per section per past term, from the grade
-- distributions a school publishes. New table only, so no existing row changes.
-- IF NOT EXISTS keeps a partly applied run safe to repeat.

-- CreateTable
CREATE TABLE IF NOT EXISTS "GradeSection" (
    "id" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "crn" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "instructor" TEXT NOT NULL,
    "a" INTEGER NOT NULL,
    "b" INTEGER NOT NULL,
    "c" INTEGER NOT NULL,
    "d" INTEGER NOT NULL,
    "f" INTEGER NOT NULL,
    "w" INTEGER NOT NULL,
    "wf" INTEGER NOT NULL,
    "other" INTEGER NOT NULL,
    "gpa" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GradeSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GradeSection_school_term_crn_key" ON "GradeSection"("school", "term", "crn");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GradeSection_school_courseCode_term_idx" ON "GradeSection"("school", "courseCode", "term");
