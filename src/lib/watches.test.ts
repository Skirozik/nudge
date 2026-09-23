import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must be called before importing the module under test
vi.mock('./prisma', () => ({
  prisma: {
    seatEvent: { create: vi.fn() },
    watch: { update: vi.fn() },
    metricEvent: { create: vi.fn() },
  },
}))

import { applyDiff, claimAlertSlot, releaseAlertSlot } from './watches'
import { prisma } from './prisma'

const mockSeatEventCreate = prisma.seatEvent.create as ReturnType<typeof vi.fn>
const mockWatchUpdate = prisma.watch.update as ReturnType<typeof vi.fn>

const baseWatch = { id: 'w1', term: '202608', crn: '12345', lastSeats: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  mockWatchUpdate.mockResolvedValue({})
  mockSeatEventCreate.mockResolvedValue({ id: 'evt1' })
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

// ── claimAlertSlot ─────────────────────────────────────────────────────────

describe('claimAlertSlot', () => {
  const w = (alertCount: number) => ({ id: 'w1', alertCount })

  it('claims the first slot on a 0→N edge', async () => {
    mockWatchUpdate.mockResolvedValueOnce({ alertCount: 1 })

    const claim = await claimAlertSlot(w(0), 3, '0_to_N')

    expect(claim).toEqual({ alertNumber: 1, retired: false })
    expect(mockWatchUpdate).toHaveBeenCalledOnce()
  })

  it('requires a fresh edge — seats merely staying open does not alert', async () => {
    const claim = await claimAlertSlot(w(1), 3, null)

    expect(claim).toBeNull()
    expect(mockWatchUpdate).not.toHaveBeenCalled()
  })

  it('does not claim on an N→0 transition', async () => {
    const claim = await claimAlertSlot(w(0), 0, 'N_to_0')

    expect(claim).toBeNull()
    expect(mockWatchUpdate).not.toHaveBeenCalled()
  })

  it('does not claim when the section reports no seats', async () => {
    const claim = await claimAlertSlot(w(0), 0, '0_to_N')

    expect(claim).toBeNull()
    expect(mockWatchUpdate).not.toHaveBeenCalled()
  })

  it('retires the watch on the final slot', async () => {
    mockWatchUpdate.mockResolvedValueOnce({ alertCount: 3 })

    const claim = await claimAlertSlot(w(2), 1, '0_to_N')

    expect(claim).toEqual({ alertNumber: 3, retired: true })
    expect(mockWatchUpdate).toHaveBeenCalledTimes(2)
    expect(mockWatchUpdate).toHaveBeenLastCalledWith({
      where: { id: 'w1' },
      data: { status: 'PAUSED' },
    })
  })

  it('refuses once the lifetime budget is spent, without touching the DB', async () => {
    const claim = await claimAlertSlot(w(3), 5, '0_to_N')

    expect(claim).toBeNull()
    expect(mockWatchUpdate).not.toHaveBeenCalled()
  })

  it('puts the cap and the cooldown in the update predicate', async () => {
    mockWatchUpdate.mockResolvedValueOnce({ alertCount: 1 })

    await claimAlertSlot(w(0), 2, '0_to_N')

    // The cap and cooldown are enforced server-side in one statement, so that a
    // concurrent poller and recovery pass cannot both claim the same slot.
    const arg = mockWatchUpdate.mock.calls[0][0]
    expect(arg.where).toMatchObject({ id: 'w1', status: 'ACTIVE', alertCount: { lt: 3 } })
    expect(arg.where.OR).toHaveLength(2)
    expect(arg.where.OR[0]).toEqual({ lastAlertAt: null })
    expect(arg.where.OR[1].lastAlertAt.lt).toBeInstanceOf(Date)
    expect(arg.data.alertCount).toEqual({ increment: 1 })
  })

  it('returns null when the predicate matches nothing (P2025)', async () => {
    mockWatchUpdate.mockRejectedValueOnce(Object.assign(new Error('no match'), { code: 'P2025' }))

    await expect(claimAlertSlot(w(0), 3, '0_to_N')).resolves.toBeNull()
  })

  it('rethrows errors that are not P2025', async () => {
    mockWatchUpdate.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'P1001' }))

    await expect(claimAlertSlot(w(0), 3, '0_to_N')).rejects.toThrow('boom')
  })
})

// ── releaseAlertSlot ───────────────────────────────────────────────────────

describe('releaseAlertSlot', () => {
  it('decrements the count and un-retires when the claim had retired it', async () => {
    await releaseAlertSlot('w1', true)

    expect(mockWatchUpdate).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { alertCount: { decrement: 1 }, status: 'ACTIVE' },
    })
  })

  it('leaves status alone when the claim had not retired the watch', async () => {
    await releaseAlertSlot('w1', false)

    expect(mockWatchUpdate).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { alertCount: { decrement: 1 } },
    })
  })
})

// ── the reported bug ───────────────────────────────────────────────────────

/**
 * A stateful stand-in for the Watch row so the claim's where-predicate is
 * actually evaluated, rather than asserted against a canned return value.
 */
function fakeWatchRow() {
  const row = { id: 'w1', alertCount: 0, status: 'ACTIVE', lastAlertAt: null as Date | null }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockWatchUpdate.mockImplementation(async ({ where, data }: any) => {
    if (data.status && !data.alertCount) {
      row.status = data.status
      return { ...row }
    }
    const capOk = !where.alertCount || row.alertCount < where.alertCount.lt
    const statusOk = !where.status || row.status === where.status
    const cooldownOk =
      !where.OR || row.lastAlertAt === null || row.lastAlertAt < where.OR[1].lastAlertAt.lt
    if (!capOk || !statusOk || !cooldownOk) {
      throw Object.assign(new Error('no matching record'), { code: 'P2025' })
    }
    row.alertCount += 1
    row.lastAlertAt = data.lastAlertAt
    return { ...row }
  })

  return row
}

describe('lifetime cap (the NUTR 2100 case)', () => {
  it('a section that reopens all day yields exactly 3 alerts, then retires', async () => {
    const row = fakeWatchRow()

    // Six genuine reopenings spread over days — the reported scenario. Each is
    // a real 0→N edge, which is why the old code texted on every one of them.
    let alerts = 0
    for (let i = 0; i < 6; i++) {
      if (row.lastAlertAt) row.lastAlertAt = new Date(Date.now() - 60 * 60 * 1000)
      const claim = await claimAlertSlot({ id: 'w1', alertCount: row.alertCount }, 1, '0_to_N')
      if (claim) alerts++
    }

    expect(alerts).toBe(3)
    expect(row.alertCount).toBe(3)
    expect(row.status).toBe('PAUSED')
  })

  it('a section flapping inside the cooldown cannot burn the budget', async () => {
    const row = fakeWatchRow()

    // Three edges in quick succession, e.g. surge mode polling every 75s.
    let alerts = 0
    for (let i = 0; i < 3; i++) {
      const claim = await claimAlertSlot({ id: 'w1', alertCount: row.alertCount }, 1, '0_to_N')
      if (claim) alerts++
    }

    expect(alerts).toBe(1)
    expect(row.status).toBe('ACTIVE')
  })

  it('re-arming after retirement restores the full budget', async () => {
    const row = fakeWatchRow()

    for (let i = 0; i < 4; i++) {
      if (row.lastAlertAt) row.lastAlertAt = new Date(Date.now() - 60 * 60 * 1000)
      await claimAlertSlot({ id: 'w1', alertCount: row.alertCount }, 1, '0_to_N')
    }
    expect(row.status).toBe('PAUSED')

    // What createWatch's reactivation path does.
    row.status = 'ACTIVE'
    row.alertCount = 0
    row.lastAlertAt = null

    const claim = await claimAlertSlot({ id: 'w1', alertCount: row.alertCount }, 1, '0_to_N')
    expect(claim).toEqual({ alertNumber: 1, retired: false })
  })
})
