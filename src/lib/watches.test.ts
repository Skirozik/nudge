import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must be called before importing the module under test
vi.mock('./prisma', () => ({
  prisma: {
    seatEvent: { create: vi.fn() },
    watch: { update: vi.fn() },
    metricEvent: { count: vi.fn(), create: vi.fn() },
  },
}))

import { applyDiff, checkAlertGuards } from './watches'
import { prisma } from './prisma'

const mockSeatEventCreate = prisma.seatEvent.create as ReturnType<typeof vi.fn>
const mockWatchUpdate = prisma.watch.update as ReturnType<typeof vi.fn>
const mockMetricCount = prisma.metricEvent.count as ReturnType<typeof vi.fn>

const baseWatch = { id: 'w1', term: '202608', crn: '12345', lastSeats: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  mockWatchUpdate.mockResolvedValue({})
  mockSeatEventCreate.mockResolvedValue({ id: 'evt1' })
  mockMetricCount.mockResolvedValue(0)
})

// ── applyDiff ──────────────────────────────────────────────────────────────

describe('applyDiff', () => {
  it('0→N: creates SeatEvent and returns 0_to_N transition', async () => {
    const result = await applyDiff({ ...baseWatch, lastSeats: 0 }, 3)

    expect(mockSeatEventCreate).toHaveBeenCalledOnce()
    expect(mockSeatEventCreate).toHaveBeenCalledWith({
      data: { term: '202608', crn: '12345', seatsFrom: 0, seatsTo: 3 },
    })
    expect(result.transition).toBe('0_to_N')
    expect(result.seatEventId).toBe('evt1')
  })

  it('N→0: creates SeatEvent and returns N_to_0 transition', async () => {
    const result = await applyDiff({ ...baseWatch, lastSeats: 2 }, 0)

    expect(mockSeatEventCreate).toHaveBeenCalledOnce()
    expect(result.transition).toBe('N_to_0')
    expect(result.seatEventId).toBe('evt1')
  })

  it('no change: skips SeatEvent and returns null transition', async () => {
    const result = await applyDiff({ ...baseWatch, lastSeats: 5 }, 5)

    expect(mockSeatEventCreate).not.toHaveBeenCalled()
    expect(result.transition).toBeNull()
    expect(result.seatEventId).toBeNull()
  })

  it('N→M (non-zero to different non-zero): creates SeatEvent but no alert transition', async () => {
    const result = await applyDiff({ ...baseWatch, lastSeats: 2 }, 4)

    expect(mockSeatEventCreate).toHaveBeenCalledOnce()
    expect(result.transition).toBeNull()
    expect(result.seatEventId).toBe('evt1')
  })

  it('always updates Watch.lastSeats and lastCheckedAt', async () => {
    await applyDiff({ ...baseWatch, lastSeats: 0 }, 1)

    expect(mockWatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'w1' },
        data: expect.objectContaining({ lastSeats: 1 }),
      })
    )
  })
})

// ── checkAlertGuards ───────────────────────────────────────────────────────

describe('checkAlertGuards', () => {
  it('allows alert when lastAlertAt is null and daily count is 0', async () => {
    mockMetricCount.mockResolvedValue(0)
    const ok = await checkAlertGuards({ id: 'w1', lastAlertAt: null })
    expect(ok).toBe(true)
  })

  it('blocks when lastAlertAt is within 10 minutes (cooldown)', async () => {
    const recentAlert = new Date(Date.now() - 5 * 60 * 1000) // 5 min ago
    const ok = await checkAlertGuards({ id: 'w1', lastAlertAt: recentAlert })
    expect(ok).toBe(false)
    // Should not even query the DB — cooldown is checked first
    expect(mockMetricCount).not.toHaveBeenCalled()
  })

  it('allows when lastAlertAt is just past the 10-minute cooldown', async () => {
    mockMetricCount.mockResolvedValue(0)
    const oldAlert = new Date(Date.now() - 11 * 60 * 1000) // 11 min ago
    const ok = await checkAlertGuards({ id: 'w1', lastAlertAt: oldAlert })
    expect(ok).toBe(true)
  })

  it('blocks when daily alert count reaches 6', async () => {
    mockMetricCount.mockResolvedValue(6)
    const ok = await checkAlertGuards({ id: 'w1', lastAlertAt: null })
    expect(ok).toBe(false)
  })

  it('allows when daily alert count is 5 (under the cap)', async () => {
    mockMetricCount.mockResolvedValue(5)
    const ok = await checkAlertGuards({ id: 'w1', lastAlertAt: null })
    expect(ok).toBe(true)
  })

  it('queries MetricEvent with the correct watchId in the meta filter', async () => {
    mockMetricCount.mockResolvedValue(0)
    await checkAlertGuards({ id: 'watch-abc', lastAlertAt: null })

    expect(mockMetricCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: 'alert_sent',
          meta: { path: ['watchId'], equals: 'watch-abc' },
        }),
      })
    )
  })
})
