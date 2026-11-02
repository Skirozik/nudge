import { notFound } from 'next/navigation'
import { normalizeReferralCode, referralText } from '@/lib/referrals'
import { SEATSNIPE_HANDLE, seatsnipeSmsLink } from '@/lib/seatsnipeBrand'
import { OpenMessages } from './OpenMessages'

// A friend's referral link, getseatsnipe.com/KX7B2Q. It checks only the code's
// shape, never the database, so the page doesn't reveal which codes exist.
export const metadata = {
  title: 'A friend sent you SeatSnipe',
  description: 'Get a text when a seat opens in your full class. Works on iPhone.',
  robots: { index: false },
}

export default async function ReferralPage({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeReferralCode((await params).code)
  if (!code) notFound()
  const text = referralText(code)

  return (
    <section className="px-6 sm:px-10 pt-14 pb-20">
      <div className="max-w-[480px] mx-auto">
        <h1 className="font-[family-name:var(--font-display)] font-black text-[40px] sm:text-[52px] leading-none tracking-[-0.04em] mb-5">
          A friend sent you SeatSnipe.
        </h1>
        <p className="text-[17px] leading-[1.65] text-[#8E8E93] mb-10">
          Text it a full class and it texts you when a seat opens. Send the message below to get started.
        </p>
        <OpenMessages href={seatsnipeSmsLink(text)} text={text} />
        <p className="text-[13px] text-[#8E8E93] mt-10">
          Messages didn&apos;t open? Text &ldquo;{text}&rdquo; to{' '}
          <code className="font-mono select-all text-white/80">{SEATSNIPE_HANDLE}</code> on iMessage. SeatSnipe works
          on iPhone.
        </p>
      </div>
    </section>
  )
}
