import { prisma } from './prisma'

const DAY_MS = 24 * 60 * 60 * 1000

/** The admin's STATS reply. */
export async function buildStatsReply(now = Date.now()): Promise<string> {
  const since = new Date(now - DAY_MS)
  const [userCount, watchCount, alertCount, alertFailedCount, seatCaughtCount] = await Promise.all([
    prisma.user.count({ where: { optedOut: false } }),
    prisma.watch.count({ where: { status: 'ACTIVE' } }),
    prisma.metricEvent.count({ where: { kind: 'alert_sent', createdAt: { gte: since } } }),
    // Seat alerts that never reached the student after every retry
    prisma.metricEvent.count({ where: { kind: 'seat_alert_failed', createdAt: { gte: since } } }),
    prisma.metricEvent.count({ where: { kind: 'seat_caught' } }),
  ])
  // Schools students asked for that aren't live yet
  const requests = await prisma.metricEvent.findMany({
    where: { kind: 'school_requested' },
    select: { meta: true },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  const demand = new Map<string, number>()
  for (const r of requests) {
    const meta = r.meta as { said?: string; schoolId?: string | null } | null
    const name = (meta?.schoolId ?? meta?.said ?? 'unknown').toLowerCase()
    demand.set(name, (demand.get(name) ?? 0) + 1)
  }
  const topDemand = [...demand].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => `${name} ${n}`).join(', ')
  return `Users: ${userCount}\nActive watches: ${watchCount}\nAlerts (24h): ${alertCount}\nAlerts failed (24h): ${alertFailedCount}\nSeats caught (all time): ${seatCaughtCount}${topDemand ? `\nSchool requests: ${topDemand}` : ''}`
}
