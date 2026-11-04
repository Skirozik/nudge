import { describe, it, expect, vi } from 'vitest'

const count = vi.fn(async ({ where }: { where: { kind?: string } }) => ({ alert_sent: 7, seat_alert_failed: 2, seat_caught: 4 } as Record<string, number>)[where.kind ?? ''] ?? 0)
vi.mock('./prisma', () => ({
  prisma: {
    user: { count: vi.fn(async () => 50) },
    watch: { count: vi.fn(async () => 12) },
    metricEvent: { count: (args: { where: { kind?: string } }) => count(args), findMany: vi.fn(async () => []) },
  },
}))

import { buildStatsReply } from './adminStats'

describe('buildStatsReply', () => {
  it('shows seat alerts that failed in the last 24h', async () => {
    const now = new Date('2026-11-04T12:00:00Z').getTime()
    const reply = await buildStatsReply(now)

    expect(reply).toContain('Alerts (24h): 7')
    expect(reply).toContain('Alerts failed (24h): 2')
    expect(count).toHaveBeenCalledWith({ where: { kind: 'seat_alert_failed', createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) } } })
  })

  it('keeps the rest of the reply as it was', async () => {
    expect(await buildStatsReply()).toBe('Users: 50\nActive watches: 12\nAlerts (24h): 7\nAlerts failed (24h): 2\nSeats caught (all time): 4')
  })
})
