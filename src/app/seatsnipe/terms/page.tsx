import { paidFromLabel } from '@/lib/payments/paidFrom'
import { SEATSNIPE_HANDLE, SEATSNIPE_SUPPORT_EMAIL } from '@/lib/seatsnipeBrand'
import { Doc } from '../Doc'

export const metadata = { title: 'Terms' }

export default function Terms() {
  return (
    <Doc title="Terms" updated="November 2, 2026">
      <p>
        These terms cover SeatSnipe, the iMessage service at {SEATSNIPE_HANDLE}. By texting SeatSnipe, you agree to
        them.
      </p>

      <h2>What SeatSnipe does</h2>
      <p>
        SeatSnipe checks your school&apos;s public class schedule and texts you when it sees a seat open in a section
        you asked it to watch. It doesn&apos;t register you for classes or hold a seat for you. It can&apos;t promise
        that a seat will open, or that it will still be open when you try to register. Alerts can be late or missed
        when your school&apos;s site, iMessage or SeatSnipe is down.
      </p>

      <h2>Price</h2>
      <ul>
        <li>Each class is $5 per semester, paid through Stripe. The watch starts once you pay.</li>
        <li>One payment covers every section of that class at your school for that semester.</li>
        <li>
          Watches set up before {paidFromLabel(undefined, true)} are free for the rest of that semester, and so is
          turning the same section back on. A new section after that date costs $5, even in a class you watched for
          free.
        </li>
        <li>Watches stop when your school&apos;s drop/add period ends.</li>
      </ul>

      <h2>No refunds, and free classes</h2>
      <ul>
        <li>Payments aren&apos;t refundable.</li>
        <li>
          If you paid for a class and SeatSnipe never sent you a seat alert for it before drop/add ended, you get a
          free class.
        </li>
        <li>If a class you paid for stops being offered before your watch can start, you get a free class.</li>
        <li>
          Free classes last until the end of the next semester. They have no cash value and can&apos;t be transferred.
          SeatSnipe asks before using one.
        </li>
      </ul>

      <h2>Referrals</h2>
      <ul>
        <li>
          Text LINK to get your link. When a friend texts SeatSnipe from your link and pays for their first class, you
          get a free class, up to 3 a semester.
        </li>
        <li>The friend has to be new to SeatSnipe and text from a phone number at a school where SeatSnipe is live.</li>
        <li>
          If a friend&apos;s payment is refunded or disputed, the free class it earned is removed. Free classes earned
          with fake or duplicate accounts are removed too.
        </li>
      </ul>

      <h2>Texts</h2>
      <p>
        By texting SeatSnipe, you agree to get texts about your watches and payments, plus occasional SeatSnipe news.
        Text STOP at any time to stop all texts, and START to turn them back on.
      </p>

      <h2>Fair use</h2>
      <p>
        Use SeatSnipe for your own classes. Don&apos;t try to overload it, get around payments or misuse it. SeatSnipe
        can stop working with anyone who does.
      </p>

      <h2>No guarantees</h2>
      <p>
        SeatSnipe is provided as is. As far as the law allows, SeatSnipe isn&apos;t responsible for a missed seat or
        for any loss beyond what you paid SeatSnipe in the 6 months before the problem.
      </p>

      <h2>Schools</h2>
      <p>
        SeatSnipe isn&apos;t run by or affiliated with any school. School names are used only to say which schools
        SeatSnipe works with.
      </p>

      <h2>Changes and contact</h2>
      <p>
        If these terms change, the date at the top changes too. Questions go to{' '}
        <a href={`mailto:${SEATSNIPE_SUPPORT_EMAIL}`}>{SEATSNIPE_SUPPORT_EMAIL}</a>.
      </p>
    </Doc>
  )
}
