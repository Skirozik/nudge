import { prisma } from './prisma'

const MAX_WATCHES = parseInt(process.env.MAX_WATCHES_PER_USER ?? '5', 10)

export interface WatchRow {
  id: string
  userId: string
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

export async function createWatch(params: {
  userId: string
  term: string
  crn: string
  courseCode: string
  sectionLabel?: string
  source?: string | null
}): Promise<{ watch?: WatchRow; error?: string }> {
  const activeCount = await prisma.watch.count({
    where: { userId: params.userId, status: 'ACTIVE' },
  })
  if (activeCount >= MAX_WATCHES) {
    return {
      error: `You already have ${activeCount} active watch${activeCount === 1 ? '' : 'es'} (max ${MAX_WATCHES}). Cancel one to add another.`,
    }
  }

  // Reactivate if an existing cancelled/expired watch for the same (user, term, crn)
  const existing = await prisma.watch.findUnique({
    where: { userId_term_crn: { userId: params.userId, term: params.term, crn: params.crn } },
  })
  if (existing) {
    if (existing.status === 'ACTIVE') {
      return { error: `Already watching ${params.courseCode} (CRN ${params.crn}).` }
    }
    const watch = await prisma.watch.update({
      where: { id: existing.id },
      data: { status: 'ACTIVE', lastSeats: 0, alertCount: 0, lastAlertAt: null, lastCheckedAt: null },
    })
    await logMetric('watch_created', params.userId, { crn: params.crn, courseCode: params.courseCode })
    return { watch: watch as WatchRow }
  }

  const watch = await prisma.watch.create({
    data: {
      userId: params.userId,
      term: params.term,
      crn: params.crn,
      courseCode: params.courseCode,
      sectionLabel: params.sectionLabel ?? null,
      source: params.source ?? null,
    },
  })
  await logMetric('watch_created', params.userId, { crn: params.crn, courseCode: params.courseCode })
  return { watch: watch as WatchRow }
}

export async function listWatches(userId: string): Promise<WatchRow[]> {
  const rows = await prisma.watch.findMany({
    where: { userId, status: 'ACTIVE' },
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
      where: { userId, status: 'ACTIVE' },
      data: { status },
    })
    return count
  }

  // Match by CRN (digits only) or by course code (partial, case-insensitive)
  const isCrn = /^\d+$/.test(q)
  const watches = await prisma.watch.findMany({
    where: isCrn
      ? { userId, crn: q, status: 'ACTIVE' }
      : { userId, status: 'ACTIVE', courseCode: { contains: q, mode: 'insensitive' } },
  })

  if (!watches.length) return 0
  await prisma.watch.updateMany({
    where: { id: { in: watches.map((w) => w.id) } },
    data: { status },
  })
  return watches.length
}

export interface DiffResult {
  transition: '0_to_N' | 'N_to_0' | null
  seatEventId: string
}

export async function applyDiff(
  watch: { id: string; lastSeats: number; term: string; crn: string },
  newSeats: number
): Promise<DiffResult> {
  const event = await prisma.seatEvent.create({
    data: { term: watch.term, crn: watch.crn, seatsFrom: watch.lastSeats, seatsTo: newSeats },
  })
  await prisma.watch.update({
    where: { id: watch.id },
    data: { lastSeats: newSeats, lastCheckedAt: new Date() },
  })

  let transition: DiffResult['transition'] = null
  if (watch.lastSeats === 0 && newSeats > 0) transition = '0_to_N'
  else if (watch.lastSeats > 0 && newSeats === 0) transition = 'N_to_0'

  return { transition, seatEventId: event.id }
}

/** Returns true if it's safe to send an alert for this watch. */
export async function checkAlertGuards(watch: {
  id: string
  lastAlertAt: Date | null
}): Promise<boolean> {
  // Max 1 alert per 10-minute window per watch
  if (watch.lastAlertAt && Date.now() - watch.lastAlertAt.getTime() < 10 * 60 * 1000) {
    return false
  }
  // Max 6 alerts per watch per calendar day
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const todayCount = await prisma.metricEvent.count({
    where: {
      kind: 'alert_sent',
      createdAt: { gte: startOfDay },
      meta: { path: ['watchId'], equals: watch.id },
    },
  })
  return todayCount < 6
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
