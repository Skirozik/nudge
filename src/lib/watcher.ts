import { prisma } from './prisma'
import { searchByCrn } from './banner'
import { applyDiff, checkAlertGuards, logMetric } from './watches'
import { scheduleSeatAlert } from './queue'
import { isSurgeMode } from './redis'

const TERM_WATCH_END = process.env.TERM_WATCH_END ? new Date(process.env.TERM_WATCH_END) : null
const OVERNIGHT_START = 1  // 1am local
const OVERNIGHT_END   = 6  // 6am local

const NORMAL_MS   = 300_000   // 5 min
const SURGE_MS    = 75_000    // 60–90s midpoint
const OVERNIGHT_MS = 900_000  // 15 min

const CIRCUIT_THRESHOLD = 5
const CIRCUIT_PAUSE_MS  = 10 * 60_000  // 10 min
const CONCURRENCY = 3

let consecutiveErrors = 0

function jitter(ms: number): number {
  return Math.floor(ms * (0.85 + Math.random() * 0.3))
}

function isOvernight(): boolean {
  const hour = new Date().getHours()
  return hour >= OVERNIGHT_START && hour < OVERNIGHT_END
}

async function getInterval(): Promise<number> {
  if (isOvernight()) return jitter(OVERNIGHT_MS)
  if (await isSurgeMode()) return jitter(SURGE_MS)
  return jitter(NORMAL_MS)
}

async function expireWatches(sendMessage: (phone: string, msg: string) => Promise<void>): Promise<void> {
  const active = await prisma.watch.findMany({
    where: { status: 'ACTIVE' },
    include: { user: { select: { phone: true } } },
  })
  if (!active.length) return

  await prisma.watch.updateMany({ where: { status: 'ACTIVE' }, data: { status: 'EXPIRED' } })
  await logMetric('watches_expired', null, { count: active.length })

  const byPhone = new Map<string, string>()
  for (const w of active) {
    byPhone.set(w.user.phone, w.user.phone)
  }
  for (const phone of byPhone.keys()) {
    try {
      await sendMessage(
        phone,
        "Registration's closed — your watches have been cleared. Good luck this semester! 🎓"
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

async function pollAll(sendMessage: (phone: string, msg: string) => Promise<void>): Promise<void> {
  const watches = await prisma.watch.findMany({
    where: { status: 'ACTIVE' },
    include: { user: { select: { phone: true } } },
  })

  // Dedup by (term, crn)
  const groups = new Map<string, CrnGroup>()
  for (const w of watches) {
    const key = `${w.term}:${w.crn}`
    if (!groups.has(key)) groups.set(key, { term: w.term, crn: w.crn, watchIds: [] })
    groups.get(key)!.watchIds.push(w.id)
  }

  const queue = [...groups.values()]
  let inFlight = 0
  let qi = 0

  await new Promise<void>((resolve) => {
    function next(): void {
      while (inFlight < CONCURRENCY && qi < queue.length) {
        const group = queue[qi++]
        inFlight++
        pollGroup(group, watches)
          .then(() => { consecutiveErrors = 0 })
          .catch(() => { consecutiveErrors++ })
          .finally(() => {
            inFlight--
            if (qi < queue.length) {
              next()
            } else if (inFlight === 0) {
              resolve()
            }
          })
      }
      if (qi >= queue.length && inFlight === 0) resolve()
    }
    next()
  })
}

async function pollGroup(
  group: CrnGroup,
  allWatches: Array<{ id: string; lastSeats: number; term: string; crn: string; lastAlertAt: Date | null; user: { phone: string } }>
): Promise<void> {
  const section = await searchByCrn(group.term, group.crn)
  if (!section) throw new Error(`[watcher] searchByCrn returned null for ${group.crn}`)

  const groupWatches = allWatches.filter((w) => w.term === group.term && w.crn === group.crn)

  for (const w of groupWatches) {
    const { transition, seatEventId } = await applyDiff(w, section.seatsAvailable)
    if (transition === '0_to_N') {
      const ok = await checkAlertGuards({ id: w.id, lastAlertAt: w.lastAlertAt })
      if (ok) {
        await scheduleSeatAlert(w.id, seatEventId)
      }
    }
  }
}

export function startWatcherLoop(
  sendMessage: (phone: string, msg: string) => Promise<void>
): void {
  const running = true

  async function loop(): Promise<void> {
    while (running) {
      // Check auto-expiry
      if (TERM_WATCH_END && Date.now() > TERM_WATCH_END.getTime()) {
        try {
          await expireWatches(sendMessage)
        } catch (err) {
          console.error('[watcher] expiry error:', err)
        }
      }

      // Circuit breaker
      if (consecutiveErrors >= CIRCUIT_THRESHOLD) {
        console.error(`[watcher] circuit open after ${consecutiveErrors} errors — pausing ${CIRCUIT_PAUSE_MS / 60000}min`)
        await logMetric('watcher_circuit_open', null, { consecutiveErrors })
        consecutiveErrors = 0
        await sleep(CIRCUIT_PAUSE_MS)
        continue
      }

      try {
        await pollAll(sendMessage)
      } catch (err) {
        console.error('[watcher] poll error:', err)
        consecutiveErrors++
      }

      await logMetric('poller_heartbeat', null, { consecutiveErrors })

      const interval = await getInterval()
      await sleep(interval)
    }
  }

  loop().catch((err) => console.error('[watcher] fatal loop error:', err))
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
