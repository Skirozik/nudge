import { prisma } from './prisma'
import type { SeatAlertJobData } from './queue'

const MAX_WATCHES = parseInt(process.env.MAX_WATCHES_PER_USER ?? '5', 10)

/** Lifetime cap: a watch gets this many seat alerts total, then retires. */
export const MAX_ALERTS_PER_WATCH = parseInt(process.env.MAX_ALERTS_PER_WATCH ?? '3', 10)
/** Stops a fast-flapping section from burning the whole budget in minutes. */
const ALERT_COOLDOWN_MS = 10 * 60 * 1000

export interface WatchRow {
  id: string
  userId: string
  school: string
  term: string
  crn: string
  courseCode: string
  sectionLabel: string | null
  status: string
  lastSeats: number
  lastCheckedAt: Date | null
  alertCount: number
  lastAlertAt: Date | null
  source: string | null
  createdAt: Date
}

/**
 * The checks a new watch has to pass: the active-watch cap and "already
 * watching". The payment step runs them before asking for $5, and createWatch
 * runs them again. Also returns this section's existing row, if there is one.
 */
export async function preflightWatch(params: {
  userId: string
  school: string
  term: string
  crn: string
  courseCode: string
}): Promise<{ error?: string; existing: WatchRow | null }> {
  const activeCount = await prisma.watch.count({
    where: { userId: params.userId, status: 'ACTIVE' },
  })
  if (activeCount >= MAX_WATCHES) {
    return {
      error: `You already have ${activeCount} active watch${activeCount === 1 ? '' : 'es'} (max ${MAX_WATCHES}). Cancel one to add another.`,
      existing: null,
    }
  }

  const existing = (await prisma.watch.findUnique({
    where: {
      userId_school_term_crn: { userId: params.userId, school: params.school, term: params.term, crn: params.crn },
    },
  })) as WatchRow | null
  if (existing?.status === 'ACTIVE') {
    return { error: `Already watching ${params.courseCode} (CRN ${params.crn}).`, existing }
  }
  return { existing }
}

export async function createWatch(params: {
  userId: string
  school: string
  term: string
  crn: string
  courseCode: string
  sectionLabel?: string
  source?: string | null
  /** Seats available at creation time — prevents a false 0→N alert on the first poll when the section already has open seats. */
  initialSeats?: number
  /**
   * When they asked for it (a replayed text can be older than now). Used on
   * insert only: re-arming keeps the original, which is what keeps a section
   * first watched before Nov 20 free.
   */
  createdAt?: Date
}): Promise<{ watch?: WatchRow; error?: string }> {
  const { error, existing } = await preflightWatch(params)
  if (error) return { error }

  // Reactivate if an existing cancelled/expired watch for the same (user, school, term, crn)
  if (existing) {
    const watch = await prisma.watch.update({
      where: { id: existing.id },
      data: { status: 'ACTIVE', lastSeats: params.initialSeats ?? 0, alertCount: 0, lastAlertAt: null, lastCheckedAt: null },
    })
    await logMetric('watch_created', params.userId, { crn: params.crn, courseCode: params.courseCode, school: params.school })
    return { watch: watch as WatchRow }
  }

  const watch = await prisma.watch.create({
    data: {
      userId: params.userId,
      school: params.school,
      term: params.term,
      crn: params.crn,
      courseCode: params.courseCode,
      sectionLabel: params.sectionLabel ?? null,
      source: params.source ?? null,
      lastSeats: params.initialSeats ?? 0,
      ...(params.createdAt && { createdAt: params.createdAt }),
    },
  })
  await logMetric('watch_created', params.userId, { crn: params.crn, courseCode: params.courseCode, school: params.school })
  return { watch: watch as WatchRow }
}

export async function listWatches(userId: string): Promise<WatchRow[]> {
  const rows = await prisma.watch.findMany({
    // PAUSED = alert budget spent. Still listed so the user can see it's retired
    // and re-arm it, rather than being told they aren't watching anything.
    where: { userId, status: { in: ['ACTIVE', 'PAUSED'] } },
    orderBy: { createdAt: 'asc' },
  })
  return rows as WatchRow[]
}

export async function cancelWatch(
  userId: string,
  query: string,
  status: 'CANCELLED' | 'FULFILLED' = 'CANCELLED'
): Promise<number> {
  const q = query.trim()
  if (q.toUpperCase() === 'ALL') {
    const { count } = await prisma.watch.updateMany({
      where: { userId, status: { in: ['ACTIVE', 'PAUSED'] } },
      data: { status },
    })
    if (status === 'FULFILLED' && count > 0) {
      await logMetric('seat_caught', userId, { query: 'all', count })
    }
    return count
  }

  // Match by CRN (digits only) or by course code (partial, case-insensitive)
  const isCrn = /^\d+$/.test(q)
  const watches = await prisma.watch.findMany({
    // PAUSED included so "got it" still resolves (and logs seat_caught) after
    // the final alert has retired the watch.
    where: isCrn
      ? { userId, crn: q, status: { in: ['ACTIVE', 'PAUSED'] } }
      : { userId, status: { in: ['ACTIVE', 'PAUSED'] }, courseCode: { contains: q, mode: 'insensitive' } },
  })

  if (!watches.length) return 0
  await prisma.watch.updateMany({
    where: { id: { in: watches.map((w) => w.id) } },
    data: { status },
  })
  if (status === 'FULFILLED') {
    // The STATS admin command counts this — it was read but never written before
    await logMetric('seat_caught', userId, { query: q, count: watches.length, crns: watches.map((w) => w.crn) })
  }
  return watches.length
}

export interface DiffResult {
  transition: '0_to_N' | 'N_to_0' | null
  /** Present only when the seat count actually changed. */
  seatEventId: string | null
}

export async function applyDiff(
  watch: { id: string; lastSeats: number; school: string; term: string; crn: string },
  newSeats: number
): Promise<DiffResult> {
  // Only record an event when something changed — writing one per watch per poll
  // adds ~288 no-op rows/day/watch and bloats the table for nothing
  let seatEventId: string | null = null
  if (newSeats !== watch.lastSeats) {
    const event = await prisma.seatEvent.create({
      data: { school: watch.school, term: watch.term, crn: watch.crn, seatsFrom: watch.lastSeats, seatsTo: newSeats },
    })
    seatEventId = event.id
  }

  await prisma.watch.update({
    where: { id: watch.id },
    data: { lastSeats: newSeats, lastCheckedAt: new Date() },
  })

  let transition: DiffResult['transition'] = null
  // <= 0, not === 0: Banner reports negative seats for over-enrolled sections,
  // and a watch parked at a negative lastSeats could never produce an edge.
  if (watch.lastSeats <= 0 && newSeats > 0) transition = '0_to_N'
  else if (watch.lastSeats > 0 && newSeats <= 0) transition = 'N_to_0'

  return { transition, seatEventId }
}

export interface AlertClaim {
  /** 1-based position in this watch's lifetime budget. */
  alertNumber: number
  /** True when this claim spent the last slot and retired the watch. */
  retired: boolean
  /** The lastAlertAt this claim wrote. Identifies the claim. */
  claimedAt: Date
}

/**
 * Reserves one of the watch's lifetime alert slots, or returns null.
 *
 * Every alert requires a fresh 0→N edge, so the user gets one text per genuine
 * reopening — never a repeat for an opening already reported. The increment is
 * claimed *before* the message is enqueued (same pattern as processReminder) so
 * that the poller and the startup recovery pass can't both alert on one edge.
 */
export async function claimAlertSlot(
  watch: { id: string; alertCount: number },
  seatsAvailable: number,
  transition: DiffResult['transition']
): Promise<AlertClaim | null> {
  if (transition !== '0_to_N' || seatsAvailable <= 0) return null
  // Cheap short-circuit on the poll snapshot; the update below is the real guard.
  if (watch.alertCount >= MAX_ALERTS_PER_WATCH) return null

  const claimedAt = new Date()
  let claimed
  try {
    claimed = await prisma.watch.update({
      where: {
        id: watch.id,
        status: 'ACTIVE',
        alertCount: { lt: MAX_ALERTS_PER_WATCH },
        OR: [
          { lastAlertAt: null },
          { lastAlertAt: { lt: new Date(Date.now() - ALERT_COOLDOWN_MS) } },
        ],
      },
      data: { alertCount: { increment: 1 }, lastAlertAt: claimedAt },
    })
  } catch (err) {
    // P2025: the predicate didn't match — someone else claimed it, the budget is
    // spent, or we're inside the cooldown. All mean "not ours to send".
    if ((err as { code?: string }).code === 'P2025') return null
    throw err
  }

  const retired = claimed.alertCount >= MAX_ALERTS_PER_WATCH
  if (retired) {
    // pollAll only selects ACTIVE, so this also stops polling Banner for it.
    await prisma.watch.update({ where: { id: watch.id }, data: { status: 'PAUSED' } })
  }
  return { alertNumber: claimed.alertCount, retired, claimedAt }
}

/** Gives a claimed slot back when the enqueue that followed it failed. */
export async function releaseAlertSlot(watchId: string, wasRetired: boolean): Promise<void> {
  // lastAlertAt is deliberately left set — worst case the retry waits out the
  // cooldown, which beats reopening a double-send window.
  await prisma.watch
    .update({
      where: { id: watchId },
      data: { alertCount: { decrement: 1 }, ...(wasRetired ? { status: 'ACTIVE' as const } : {}) },
    })
    .catch((e) => console.error(`[watches] Failed to release alert slot for ${watchId}:`, e))
}

/**
 * The worker's failed handler, for seat alerts only. Runs once, after the last
 * attempt. Nothing reached the student, so the claimed slot goes back and
 * lastSeats goes back to 0, which lets the next poll see a fresh 0→N edge.
 * lastAlertAt is cleared too, or that edge would land inside the cooldown and
 * be dropped. If BlueBubbles is still down, the next alert fails the same way
 * about 5 minutes later, so retries stay paced.
 *
 * Skipped, apart from the metric, when the watch no longer reflects this claim:
 * it was cancelled, expired or fulfilled, or it was re-armed (lastAlertAt reset).
 *
 * Returns true when it handled the job.
 */
export async function handleSeatAlertJobFailed(
  job: { name: string; attemptsMade: number; opts: { attempts?: number }; data: unknown },
  err: Error
): Promise<boolean> {
  if (job.name !== 'send-seat-alert') return false
  if (job.attemptsMade < (job.opts.attempts ?? 1)) return false // BullMQ will retry it

  const { watchId, alertNumber, claimedAt } = job.data as SeatAlertJobData
  const watch = await prisma.watch.findUnique({
    where: { id: watchId },
    select: { userId: true, status: true, lastAlertAt: true },
  })
  const stillThisClaim =
    !!watch &&
    (watch.status === 'ACTIVE' || watch.status === 'PAUSED') &&
    (claimedAt === undefined || watch.lastAlertAt?.getTime() === claimedAt)

  if (stillThisClaim) {
    await releaseAlertSlot(watchId, alertNumber >= MAX_ALERTS_PER_WATCH)
    await prisma.watch.update({ where: { id: watchId }, data: { lastSeats: 0, lastAlertAt: null } })
  }
  console.error(`[watches] Seat alert ${alertNumber} for watch ${watchId} failed after ${job.attemptsMade} attempts${stillThisClaim ? ', slot released' : ''}:`, err.message)
  await logMetric('seat_alert_failed', watch?.userId ?? null, {
    watchId,
    alertNumber,
    attempts: job.attemptsMade,
    released: stillThisClaim,
    error: err.message.slice(0, 200),
  })
  return true
}

export async function logMetric(
  kind: string,
  userId?: string | null,
  meta?: Record<string, unknown>
): Promise<void> {
  await prisma.metricEvent.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { kind, userId: userId ?? null, meta: (meta as any) ?? undefined },
  })
}
