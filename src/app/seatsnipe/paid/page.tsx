import { seatsnipeSmsLink } from '@/lib/seatsnipeBrand'

// Where Stripe Checkout sends students after they pay
export const metadata = { title: 'Paid', robots: { index: false } }

export default function Paid() {
  return (
    <section className="px-6 sm:px-10 pt-14 pb-20">
      <div className="max-w-[480px] mx-auto">
        <h1 className="font-[family-name:var(--font-display)] font-black text-[44px] leading-none tracking-[-0.04em] mb-5">
          You&apos;re paid.
        </h1>
        <p className="text-[17px] leading-[1.65] text-[#8E8E93] mb-10">
          SeatSnipe will text you in a moment to say your watch is on.
        </p>
        <a
          href={seatsnipeSmsLink()}
          className="inline-flex bg-[#007AFF] hover:bg-[#0071E3] transition-colors text-white text-[16px] font-semibold px-7 py-3 rounded-full"
        >
          Back to Messages
        </a>
      </div>
    </section>
  )
}
