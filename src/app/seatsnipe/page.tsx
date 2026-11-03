import IPhoneDemo, { type DemoMessage } from '../IPhoneDemo'
import { SCHOOLS, liveSchools } from '@/lib/schools'
import { SEATSNIPE_HANDLE, seatsnipeSmsLink } from '@/lib/seatsnipeBrand'
import { WRAP } from './wrap'

// A made-up exchange in the bot's real formats: the agent's section list with
// grade lines, and the worker's seat alert word for word. The professors are
// invented so the homepage never shows a real one's D/F/W rate.
const DEMO: DemoMessage[] = [
  { from: 'me', text: 'watch MATH 2212' },
  {
    from: 'them',
    text:
      'MATH 2212 at GSU:\n' +
      '1. CRN 12483, TTh 9:30am, Rivera (full). Avg GPA 3.41, 11% D/F/W\n' +
      '2. CRN 12809, MW 2:00pm, Okafor (full). Avg GPA 2.74, 27% D/F/W\n' +
      '3. CRN 13740, MWF 11:00am, Chen (2 seats open)\n' +
      'Grades are from GSU since Spring 2024. Which ones should I watch?',
  },
  { from: 'me', text: '1' },
  { from: 'them', text: "Watching CRN 12483. I'll text you when a seat opens." },
  { from: 'stamp', text: '3:52 PM' },
  {
    from: 'them',
    text: '🚨 Seat opened in MATH 2212 (Sec 004, TTh 9:30am–10:45am, Rivera, Ana), 1 seat available! Register at gosolar.gsu.edu before it fills up.',
  },
  { from: 'me', text: 'got in!!' },
  { from: 'them', text: "Let's go! I stopped watching that one." },
]

// "GSU", "GSU and Georgia Tech", "Georgia Tech, UGA and Kennesaw State"
function listNames(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// The one capsule on the site, the iOS shape for the action that opens Messages
const TEXT_BUTTON =
  'inline-flex items-center gap-2.5 bg-[#007AFF] hover:bg-[#0071E3] transition-colors text-white text-[16px] font-semibold px-7 py-3 rounded-full tracking-[-0.01em]' // unslop-ignore

function TextButton() {
  return (
    <div className="flex flex-col gap-3 items-start">
      <a href={seatsnipeSmsLink()} className={TEXT_BUTTON}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
        </svg>
        Text SeatSnipe
      </a>
      <p className="text-[13px] text-[#8E8E93]">
        <code className="font-mono select-all">{SEATSNIPE_HANDLE}</code> on iMessage. iPhone only.
      </p>
    </div>
  )
}

const STEPS = [
  {
    title: 'Text the class.',
    body: 'Send “watch MATH 2212” or a CRN. The first time, it asks which school you go to.',
  },
  {
    title: 'Pick your sections.',
    body:
      "It sends back every section with its time and open seats. At GSU it also shows each professor's average GPA and D/F/W rate in that course. Reply with the ones you want, up to 5 at a time.",
  },
  {
    title: 'Register when it texts you.',
    body: "Open seats go fast, so sign up on your school's site right away. SeatSnipe can't hold a seat or register for you.",
  },
]

export default function SeatSnipeHome() {
  const live = liveSchools()
  const soon = SCHOOLS.filter((s) => !live.some((l) => l.id === s.id))

  const questions: Array<[string, string]> = [
    ['What does it cost?', 'Nothing this semester.'],
    [
      'Why is it an iCloud address?',
      "SeatSnipe runs on iMessage, so you text it like you'd text a friend. That's also why it only works on iPhone.",
    ],
    [
      'Does it need my school login?',
      "No. It checks the public class schedule anyone can search without logging in, and it'll never ask for your password.",
    ],
    ['How often does it check?', 'About every 90 seconds during the day, and every 15 minutes from 1 to 6 AM.'],
    [
      'How many texts will I get?',
      "One each time a seat opens in a section you're watching. After 3 alerts for the same section it stops and tells you how to turn it back on. Text STOP any time to stop everything.",
    ],
    [
      'Where do the grades come from?',
      "GSU publishes grade distributions for its classes. SeatSnipe uses the last three years and only shows a professor's numbers once at least 20 students got a letter grade from them in that course.",
    ],
    [
      'Which schools?',
      `Live at ${listNames(live.map((s) => s.shortName))}.${soon.length ? ` Coming soon to ${listNames(soon.map((s) => s.shortName))}.` : ''}`,
    ],
  ]

  return (
    <>
      <section className={`${WRAP} pt-8 sm:pt-14 pb-16 grid lg:grid-cols-[1fr_auto] gap-12 lg:gap-20 lg:items-center`}>
        <div className="max-w-[520px]">
          <h1 className="font-[family-name:var(--font-display)] font-black text-[44px] sm:text-[68px] leading-none tracking-[-0.04em] mb-6">
            Get a text when a seat opens.
          </h1>
          <p className="text-[17px] leading-[1.65] text-[#8E8E93] mb-10">
            Text SeatSnipe the class you need, like “watch MATH 2212”. Pick the sections you want, and it&apos;ll text you
            when a seat opens in one of them.
          </p>
          <TextButton />
          <p className="text-[15px] text-[#C7C7CC] mt-8">
            Free this semester. There&apos;s nothing to download and no account to make.
          </p>
        </div>

        <figure className="mx-auto lg:mx-0">
          <div className="w-[297px] h-[628px] sm:w-[362px] sm:h-[766px] max-[380px]:w-[268px] max-[380px]:h-[567px]">
            <div className="w-[362px] origin-top-left scale-[0.82] sm:scale-100 max-[380px]:scale-[0.74]">
              <IPhoneDemo script={DEMO} contact="SeatSnipe" startTime={'10:05 AM'} still />
            </div>
          </div>
          <figcaption className="mt-4 text-[12px] text-[#636366]">Example conversation. The professors are made up.</figcaption>
        </figure>
      </section>

      <section className="border-t border-[#1E1E1E]">
        <div className={`${WRAP} py-16`}>
          <h2 className="font-[family-name:var(--font-display)] font-black text-[32px] sm:text-[40px] leading-[1.05] tracking-[-0.03em] mb-10">
            How it works
          </h2>
          <ol className="max-w-[640px] space-y-8">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[2.5rem_1fr] gap-x-4">
                <span className="font-[family-name:var(--font-display)] font-black text-[28px] leading-none text-[#007AFF] tabular-nums">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[17px] font-semibold text-white mb-1.5">{s.title}</p>
                  <p className="text-[16px] leading-[1.65] text-[#C7C7CC]">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-[#1E1E1E]">
        <div className={`${WRAP} py-16`}>
          <h2 className="font-[family-name:var(--font-display)] font-black text-[32px] sm:text-[40px] leading-[1.05] tracking-[-0.03em] mb-10">
            Questions people ask
          </h2>
          <dl className="max-w-[840px] border-b border-[#1E1E1E]">
            {questions.map(([q, a]) => (
              <div key={q} className="grid sm:grid-cols-[240px_1fr] gap-x-10 gap-y-1.5 py-5 border-t border-[#1E1E1E]">
                <dt className="text-[15px] font-semibold text-white">{q}</dt>
                <dd className="text-[15px] leading-[1.65] text-[#C7C7CC]">{a}</dd>
              </div>
            ))}
          </dl>
          <div className="pt-12">
            <TextButton />
          </div>
        </div>
      </section>
    </>
  )
}
