import { prisma } from './prisma'
import { bannerFor } from './banner'
import { isThrottled } from './bannerErrors'
import { applyDiff, claimAlertSlot, releaseAlertSlot, logMetric, MAX_ALERTS_PER_WATCH } from './watches'
import { scheduleSeatAlert } from './queue'
import { isSurgeMode } from './redis'
import { liveSchools, termWatchEnd, type LiveSchool } from './schools'
import { normalizePhone } from './phone'

const OVERNIGHT_START = 1  // 1am local
const OVERNIGHT_END   = 6  // 6am local

const NORMAL_MS   = 90_000    // ~90s daytime
const SURGE_MS    = 75_000    // 60–90s midpoint
const OVERNIGHT_MS = 900_000  // 15 min
const PRIORITY_MS = 25_000    // the admin's own watches, day and night

const CIRCUIT_THRESHOLD = 5
const CIRCUIT_PAUSE_MS  = 10 * 60_000  // 10 min
const CONCURRENCY = 3

function jitter(ms: number): number {
  return Math.floor(ms * (0.85 + Math.random() * 0.3))
}

function isOvernight(): boolean {
  const hour = new Date().getHours()
  return hour >= OVERNIGHT_START && hour < OVERNIGHT_END
}

async function getInterval(schoolId: string): Promise<number> {
  if (isOvernight()) return jitter(OVERNIGHT_MS)
  if (await isSurgeMode(schoolId)) return jitter(SURGE_MS)
  return jitter(NORMAL_MS)
}

/** Watches for one section share a single Banner request. */
export function sectionKey(w: { school: string; term: string; crn: string }): string {
  return `${w.school}:${w.term}:${w.crn}`
}

async function expireWatches(
  school: LiveSchool,
  sendMessage: (phone: string, msg: string) => Promise<void>
): Promise<void> {
  // PAUSED watches have spent their alert budget and are no longer polled, but
  // they still show in list_watches — sweep them too so none linger past the term.
  const live = await prisma.watch.findMany({
    where: { school: school.id, status: { in: ['ACTIVE', 'PAUSED'] } },
    include: { user: { select: { phone: true } } },
  })
  if (!live.length) return

  await prisma.watch.updateMany({
    where: { school: school.id, status: { in: ['ACTIVE', 'PAUSED'] } },
    data: { status: 'EXPIRED' },
  })
  await logMetric('watches_expired', null, { count: live.length, school: school.id })

  // Only users with a still-running watch get the text; a retired one already
  // got a final alert saying it was done.
  const phones = new Set<string>()
  for (const w of live) {
    if (w.status === 'ACTIVE') phones.add(w.user.phone)
  }
  for (const phone of phones) {
    try {
      await sendMessage(
        phone,
        `Registration's closed at ${school.shortName} — your watches there have been cleared. Good luck this semester! 🎓`
      )
    } catch {
      // Best-effort; don't block expiry on a failed text
    }
  }
}

interface CrnGroup {
  term: string
  crn: string
  watchIds: string[]
}

type PolledWatch = {
  id: string
  lastSeats: number
  school: string
  term: string
  crn: string
  courseCode: string
  lastAlertAt: Date | null
  alertCount: number
  user: { phone: string }
}

/**
 * The admin's watches run in their own fast lane and nowhere else, so no watch
 * is ever polled by two loops at once. Without ADMIN_PHONE there is no fast lane.
 */
export type Lane = 'normal' | 'priority'

export function laneFilter(lane: Lane, adminPhone: string | undefined): Record<string, unknown> | null {
  const phone = adminPhone?.trim() ? normalizePhone(adminPhone) : null
  if (!phone) return lane === 'normal' ? {} : null
  return lane === 'priority' ? { user: { phone } } : { NOT: { user: { phone } } }
}

/**
 * How one pass over a lane went. 'throttled' means Banner answered with the
 * silent throttle, 'ok' means at least one section came back for real, and
 * 'idle' means neither (no watches, or only errors).
 */
export type CycleOutcome = 'ok' | 'throttled' | 'idle'

/** Throttled cycles in a row for one school before the admin gets a text. */
export const THROTTLE_ALERT_CYCLES = 5

// Per school, across both lanes, since they share one Banner client
const throttleStreaks = new Map<string, { cycles: number; notified: boolean }>()

/** For tests. */
export function resetThrottleStreaks(): void {
  throttleStreaks.clear()
}

/**
 * Texts the admin once per throttled stretch, after THROTTLE_ALERT_CYCLES
 * throttled cycles in a row. The heartbeat keeps running while a school is
 * throttled, so the dead-man check never notices this on its own.
 */
export async function recordThrottleCycle(
  school: { id: string; shortName: string },
  outcome: CycleOutcome,
  notifyAdmin: (msg: string) => Promise<void>
): Promise<void> {
  if (outcome === 'idle') return
  if (outcome === 'ok') {
    throttleStreaks.delete(school.id)
    return
  }
  const streak = throttleStreaks.get(school.id) ?? { cycles: 0, notified: false }
  streak.cycles++
  throttleStreaks.set(school.id, streak)
  if (streak.cycles < THROTTLE_ALERT_CYCLES || streak.notified) return
  streak.notified = true
  try {
    await notifyAdmin(
      `⚠️ SeatSnipe: ${school.shortName} class search has looked throttled for ${streak.cycles} polls in a row, so its watches aren't being checked. Look at the worker logs.`
    )
  } catch (err) {
    console.error(`[watcher:${school.id}] failed to text the admin about throttling:`, err)
  }
}

/** Per-school loop state. */
interface LoopState {
  consecutiveErrors: number
}

async function pollAll(school: LiveSchool, state: LoopState, lane: Record<string, unknown>): Promise<CycleOutcome> {
  const watches = await prisma.watch.findMany({
    // The alertCount bound is a backstop: claimAlertSlot flips spent watches to
    // PAUSED, but this also drops any left ACTIVE by an older build or a crash.
    where: { school: school.id, status: 'ACTIVE', alertCount: { lt: MAX_ALERTS_PER_WATCH }, ...lane },
    select: { id: true, userId: true, school: true, term: true, crn: true, courseCode: true, lastSeats: true, lastAlertAt: true, alertCount: true, user: { select: { phone: true } } },
  })

  // Dedup by section
  const groups = new Map<string, CrnGroup>()
  for (const w of watches) {
    const key = sectionKey(w)
    if (!groups.has(key)) groups.set(key, { term: w.term, crn: w.crn, watchIds: [] })
    groups.get(key)!.watchIds.push(w.id)
  }

  const queue = [...groups.values()]
  let inFlight = 0
  let qi = 0
  // Once Banner throttles us, send no more requests this cycle. Hammering it
  // would only stretch the throttle out.
  let throttled = false
  let anyOk = false

  await new Promise<void>((resolve) => {
    function done(): boolean {
      return inFlight === 0 && (throttled || qi >= queue.length)
    }
    function next(): void {
      while (inFlight < CONCURRENCY && qi < queue.length && !throttled) {
        const group = queue[qi++]
        inFlight++
        pollGroup(school, group, watches)
          .then((outcome) => {
            if (outcome === 'throttled') {
              throttled = true
              return
            }
            anyOk = true
            state.consecutiveErrors = 0
          })
          .catch(() => { state.consecutiveErrors++ })
          .finally(() => {
            inFlight--
            if (done()) resolve()
            else next()
          })
      }
      if (done()) resolve()
    }
    next()
  })
  if (throttled) {
    console.warn(`[watcher:${school.id}] Banner is throttling, skipped the rest of this cycle`)
    try { await logMetric('banner_throttled', null, { school: school.id }) } catch {}
    return 'throttled'
  }
  return anyOk ? 'ok' : 'idle'
}

/**
 * Returns 'throttled' when Banner is throttling us. That is not a failure of
 * this section, so nothing is diffed or alerted and the error count is left alone.
 */
export async function pollGroup(school: LiveSchool, group: CrnGroup, allWatches: PolledWatch[]): Promise<'ok' | 'throttled'> {
  const groupWatches = allWatches.filter((w) => w.term === group.term && w.crn === group.crn)
  const firstWatch = groupWatches[0]
  if (!firstWatch) return 'ok'
  let section
  try {
    section = await bannerFor(school.id).searchByCrn(group.term, group.crn, firstWatch.courseCode)
  } catch (err) {
    if (isThrottled(err)) return 'throttled'
    throw err
  }
  if (!section) throw new Error(`[watcher:${school.id}] searchByCrn returned null for ${group.crn}`)

  for (const w of groupWatches) {
    const { transition, seatEventId } = await applyDiff(w, section.takeableSeats)
    const claim = await claimAlertSlot(w, section.takeableSeats, transition)
    if (!claim) continue
    try {
      await scheduleSeatAlert({
        watchId: w.id,
        alertNumber: claim.alertNumber,
        claimedAt: claim.claimedAt,
        seats: section.takeableSeats,
        seatEventId,
      })
    } catch (err) {
      // The slot is already spent; hand it back so the next edge can use it.
      await releaseAlertSlot(w.id, claim.retired)
      throw err
    }
  }
  return 'ok'
}

function startSchoolLoop(
  school: LiveSchool,
  sendMessage: (phone: string, msg: string) => Promise<void>,
  lane: Lane,
  filter: Record<string, unknown>,
  notifyAdmin: (msg: string) => Promise<void>
): void {
  const state: LoopState = { consecutiveErrors: 0 }
  const tag = lane === 'normal' ? `[watcher:${school.id}]` : `[watcher:${school.id}:priority]`

  async function loop(): Promise<void> {
    while (true) {
      // Check auto-expiry (once per school, in the normal lane)
      const termEnd = termWatchEnd(school)
      if (lane === 'normal' && termEnd && Date.now() > termEnd.getTime()) {
        try {
          await expireWatches(school, sendMessage)
        } catch (err) {
          console.error(`${tag} expiry error:`, err)
        }
      }

      // Circuit breaker
      if (state.consecutiveErrors >= CIRCUIT_THRESHOLD) {
        console.error(`${tag} circuit open after ${state.consecutiveErrors} errors — pausing ${CIRCUIT_PAUSE_MS / 60000}min`)
        try { await logMetric('watcher_circuit_open', null, { consecutiveErrors: state.consecutiveErrors, school: school.id }) } catch {}
        state.consecutiveErrors = 0
        await sleep(CIRCUIT_PAUSE_MS)
        continue
      }

      try {
        const outcome = await pollAll(school, state, filter)
        await recordThrottleCycle(school, outcome, notifyAdmin)
      } catch (err) {
        console.error(`${tag} poll error:`, err)
        state.consecutiveErrors++
      }

      // The dead-man check reads the normal lane's heartbeat
      if (lane === 'normal') {
        try { await logMetric('poller_heartbeat', null, { consecutiveErrors: state.consecutiveErrors, school: school.id }) } catch {}
      }

      const interval = lane === 'priority' ? jitter(PRIORITY_MS) : await getInterval(school.id).catch(() => jitter(NORMAL_MS))
      await sleep(interval)
    }
  }

  async function supervise(): Promise<void> {
    while (true) {
      try {
        await loop()
      } catch (err) {
        console.error(`${tag} fatal loop error — restarting in 60s:`, err)
        await sleep(60_000)
      }
    }
  }

  supervise()
}

/** One independent polling loop per live school. */
export function startWatcherLoop(sendMessage: (phone: string, msg: string) => Promise<void>): void {
  const schools = liveSchools()
  if (!schools.length) {
    console.warn('[watcher] no live schools — check ENABLED_SCHOOLS')
    return
  }
  const priority = laneFilter('priority', process.env.ADMIN_PHONE)
  const adminPhone = process.env.ADMIN_PHONE?.trim() ? normalizePhone(process.env.ADMIN_PHONE) : null
  const notifyAdmin = async (msg: string): Promise<void> => {
    if (adminPhone) await sendMessage(adminPhone, msg)
    else console.warn(`[watcher] no ADMIN_PHONE, not sent: ${msg}`)
  }
  for (const school of schools) {
    console.log(`[watcher] starting loop for ${school.shortName}`)
    startSchoolLoop(school, sendMessage, 'normal', laneFilter('normal', process.env.ADMIN_PHONE)!, notifyAdmin)
    if (priority) {
      console.log(`[watcher] starting priority loop for ${school.shortName} (admin watches, ~${PRIORITY_MS / 1000}s)`)
      startSchoolLoop(school, sendMessage, 'priority', priority, notifyAdmin)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
