import { SCHOOLS, liveSchools } from '@/lib/schools'
import { SEATSNIPE_HANDLE, seatsnipeSmsLink } from '@/lib/seatsnipeBrand'

// "GSU", "GSU and Georgia Tech", "Georgia Tech, UGA and Kennesaw State"
function listNames(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function TextButton() {
  return (
    <div className="flex flex-col gap-3 items-start">
      <a
        href={seatsnipeSmsLink()}
        className="inline-flex items-center gap-2.5 bg-[#007AFF] hover:bg-[#0071E3] transition-colors text-white text-[16px] font-semibold px-7 py-3 rounded-full tracking-[-0.01em]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
        </svg>
        Text SeatSnipe
      </a>
      <p className="text-[13px] text-[#8E8E93]">
        <code className="font-mono select-all">{SEATSNIPE_HANDLE}</code> on iMessage. Works on iPhone.
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-6 sm:px-10 py-14 border-t border-[#1E1E1E]">
      <div className="max-w-[720px] mx-auto">
        <h2 className="font-[family-name:var(--font-display)] font-black text-[32px] sm:text-[40px] leading-[1.05] tracking-[-0.03em] mb-6">
          {title}
        </h2>
        <div className="space-y-4 text-[16px] leading-[1.65] text-[#C7C7CC]">{children}</div>
      </div>
    </section>
  )
}

export default function SeatSnipeHome() {
  const live = liveSchools()
  const soon = SCHOOLS.filter((s) => !live.some((l) => l.id === s.id))

  return (
    <>
      <section className="px-6 sm:px-10 pt-14 pb-20">
        <div className="max-w-[720px] mx-auto">
          <h1 className="font-[family-name:var(--font-display)] font-black text-[44px] sm:text-[68px] leading-none tracking-[-0.04em] mb-6">
            Get a text when a seat opens.
          </h1>
          <p className="text-[17px] leading-[1.65] text-[#8E8E93] max-w-[480px] mb-10">
            Class full? Text SeatSnipe the class you need, like &ldquo;watch CSC 2720&rdquo;, or its CRN. When a seat
            opens you get a text, so you can register before someone else takes it.
          </p>
          <TextButton />
        </div>
      </section>

      <Section title="How it works">
        <p>
          <span className="text-white font-semibold">1. Text the class.</span> Send &ldquo;watch CSC 2720&rdquo; or a
          CRN. The first time, SeatSnipe asks which school you go to.
        </p>
        <p>
          <span className="text-white font-semibold">2. Pick your sections.</span> SeatSnipe texts back the sections
          with live seat counts. Reply with the ones you want and the watch starts right away.
        </p>
        <p>
          <span className="text-white font-semibold">3. Get the text.</span> When a seat opens, register on your
          school&apos;s site right away. Open seats go fast.
        </p>
      </Section>

      <Section title="Free this semester">
        <p>SeatSnipe is free for the spring semester. No app, no account, nothing to pay.</p>
        <p>
          During the day it checks your school&apos;s live seat data about every 90 seconds, and watches run until
          your school&apos;s drop/add period ends.
        </p>
      </Section>

      <Section title="Schools">
        <p>
          Live at {listNames(live.map((s) => s.shortName))}.
          {soon.length > 0 && <> Coming soon to {listNames(soon.map((s) => s.shortName))}.</>}
        </p>
        <div className="pt-4">
          <TextButton />
        </div>
      </Section>
    </>
  )
}
