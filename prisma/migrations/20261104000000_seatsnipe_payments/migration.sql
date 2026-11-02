-- SeatSnipe payments: $5 per class from Nov 20 2026, free classes (credits),
-- the "use your free class?" question, and referrals. Everything is new and
-- nothing writes to it yet, so no existing row changes.
-- Statuses are TEXT, not enums, so an older worker client can still read them.
-- IF NOT EXISTS (and duplicate_object on the foreign keys) keeps a partly
-- applied run safe to repeat.

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referredByCode" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "crns" TEXT[],
    "openSeatsAtLink" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "openKey" TEXT,
    "amountCents" INTEGER NOT NULL DEFAULT 500,
    "stripeSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "url" TEXT,
    "livemode" BOOLEAN,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "outcome" JSONB,
    "activatedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "firstLinkAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "disputedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ClassPass" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "via" TEXT NOT NULL,
    "paymentId" TEXT,
    "creditId" TEXT,
    "firstAlertAt" TIMESTAMP(3),
    "noSeatCreditAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Credit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Credit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CreditOffer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "crns" TEXT[],
    "creditId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'asked',
    "openKey" TEXT,
    "reasked" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "outcome" JSONB,
    "activatedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "friendId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "slot" INTEGER,
    "creditId" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_openKey_key" ON "Payment"("openKey");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_stripeSessionId_key" ON "Payment"("stripeSessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");
CREATE INDEX IF NOT EXISTS "Payment_userId_status_idx" ON "Payment"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ClassPass_paymentId_key" ON "ClassPass"("paymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "ClassPass_creditId_key" ON "ClassPass"("creditId");
CREATE UNIQUE INDEX IF NOT EXISTS "ClassPass_userId_school_term_courseCode_key" ON "ClassPass"("userId", "school", "term", "courseCode");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Credit_reason_sourceId_key" ON "Credit"("reason", "sourceId");
CREATE INDEX IF NOT EXISTS "Credit_userId_usedAt_expiresAt_idx" ON "Credit"("userId", "usedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CreditOffer_openKey_key" ON "CreditOffer"("openKey");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_friendId_key" ON "Referral"("friendId");
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_paymentId_key" ON "Referral"("paymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_creditId_key" ON "Referral"("creditId");
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_referrerId_semester_slot_key" ON "Referral"("referrerId", "semester", "slot");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClassPass" ADD CONSTRAINT "ClassPass_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Credit" ADD CONSTRAINT "Credit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CreditOffer" ADD CONSTRAINT "CreditOffer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Referral" ADD CONSTRAINT "Referral_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
