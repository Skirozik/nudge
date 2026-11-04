import { prisma } from './prisma'
import { getSchool } from './schools'
import { logMetric, MAX_ALERTS_PER_WATCH } from './watches'
import { afterSend } from './afterSend'
import type { SeatAlertJobData } from './queue'

/**
 * The send-seat-alert job. Throws only when the text itself fails, so BullMQ
 * retries a send that didn't happen and never one that did.
 */
export async function processSeatAlertJob(
  data: SeatAlertJobData,
  sendMessage: (phone: string, msg: string) => Promise<void>
): Promise<void> {
  const { watchId, seatEventId, seats, alertNumber } = data
  const watch = await prisma.watch.findUnique({
    where: { id: watchId },
    include: { user: true },
  })
  // PAUSED is expected on the final alert — claimAlertSlot retires the watch
  // at claim time — so gate on the states that actually mean "don't send".
  const dead = watch && ['CANCELLED', 'EXPIRED', 'FULFILLED'].includes(watch.status)
  if (!watch || dead || watch.user.optedOut) return

  const courseLabel = watch.sectionLabel ? `${watch.courseCode} (${watch.sectionLabel})` : watch.courseCode
  // seats comes from the payload: watch.lastSeats is overwritten by every
  // poll and can read 0 by the time this job runs.
  const isFinal = alertNumber >= MAX_ALERTS_PER_WATCH
  const tail = isFinal
    ? ` (that's ${alertNumber} of ${MAX_ALERTS_PER_WATCH}, so this watch is done. text "watch ${watch.courseCode} ${watch.crn}" to turn it back on.)`
    : ''
  const registerSite = getSchool(watch.school)?.banner?.registerSite
  const registerHint = registerSite ? `Register at ${registerSite} before it fills up.` : 'Register before it fills up.'
  const msg = `🚨 Seat opened in ${courseLabel}, ${seats} seat${seats === 1 ? '' : 's'} available! ${registerHint}${tail}`

  // alertCount/lastAlertAt were already written by claimAlertSlot.
  await sendMessage(watch.user.phone, msg)
  await afterSend(`Logging seat alert for watch ${watchId}`, () =>
    prisma.message.create({ data: { userId: watch.userId, direction: 'out', body: msg } })
  )
  await afterSend(`alert_sent metric for watch ${watchId}`, () =>
    logMetric('alert_sent', watch.userId, { watchId, seatEventId, alertNumber })
  )
  console.log(`[worker] Seat alert sent for watch ${watchId} (${watch.courseCode})`)
}
