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
        <li>SeatSnipe is free this semester. If that changes for a future semester, these terms change first.</li>
        <li>Watches stop when your school&apos;s drop/add period ends.</li>
      </ul>

      <h2>Texts</h2>
      <p>
        By texting SeatSnipe, you agree to get texts about your watches, plus occasional SeatSnipe news.
        Text STOP at any time to stop all texts, and START to turn them back on.
      </p>

      <h2>Fair use</h2>
      <p>
        Use SeatSnipe for your own classes. Don&apos;t try to overload it or misuse it. SeatSnipe
        can stop working with anyone who does.
      </p>

      <h2>No guarantees</h2>
      <p>
        SeatSnipe is provided as is. As far as the law allows, SeatSnipe isn&apos;t responsible for a missed seat or
        for any other loss from using it.
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
