import { SEATSNIPE_SUPPORT_EMAIL } from '@/lib/seatsnipeBrand'
import { Doc } from '../Doc'

export const metadata = { title: 'Privacy' }

export default function Privacy() {
  return (
    <Doc title="Privacy" updated="November 2, 2026">
      <h2>What SeatSnipe keeps</h2>
      <ul>
        <li>The phone number or Apple ID email you text from.</li>
        <li>The texts you send SeatSnipe and the texts it sends you.</li>
        <li>Your school, timezone, and the classes and sections you watch.</li>
      </ul>

      <h2>What it&apos;s used for</h2>
      <p>
        Running SeatSnipe: understanding your texts, watching your classes, texting you alerts and replies, and
        stopping abuse. Your info isn&apos;t sold, and it isn&apos;t used for ads.
      </p>

      <h2>Who else handles it</h2>
      <ul>
        <li>Apple carries the texts over iMessage, which SeatSnipe sends and receives on its own Mac.</li>
        <li>Anthropic&apos;s Claude reads your texts to understand them and write replies.</li>
        <li>Vercel, Neon and Upstash host the app and store its data.</li>
      </ul>
      <p>
        To check seats, SeatSnipe reads your school&apos;s public class schedule. It never logs in as you and never
        asks for your school password.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Text STOP to stop all texts.</li>
        <li>
          Email <a href={`mailto:${SEATSNIPE_SUPPORT_EMAIL}`}>{SEATSNIPE_SUPPORT_EMAIL}</a> to see or delete what
          SeatSnipe has about you.
        </li>
      </ul>

      <h2>Kids</h2>
      <p>SeatSnipe is for college students. Don&apos;t use it if you&apos;re under 13.</p>

      <h2>Changes</h2>
      <p>If this policy changes, the date at the top changes too.</p>
    </Doc>
  )
}
