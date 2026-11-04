import { describe, it, expect, vi } from 'vitest'

vi.mock('./prisma', () => ({ prisma: {} }))
vi.mock('./banner', () => ({ bannerFor: vi.fn() }))
vi.mock('./queue', () => ({ scheduleSeatAlert: vi.fn() }))
vi.mock('./redis', () => ({ isSurgeMode: vi.fn() }))
vi.mock('./watches', () => ({ applyDiff: vi.fn(), claimAlertSlot: vi.fn(), releaseAlertSlot: vi.fn(), logMetric: vi.fn(), MAX_ALERTS_PER_WATCH: 3 }))

import { laneFilter, pollGroup, recordThrottleCycle, resetThrottleStreaks, THROTTLE_ALERT_CYCLES } from './watcher'
import { bannerFor } from './banner'
import { applyDiff, claimAlertSlot } from './watches'
import { scheduleSeatAlert } from './queue'
import { BannerThrottledError } from './bannerErrors'
import type { LiveSchool } from './schools'

describe('pollGroup', () => {
  const school = { id: 'gsu' } as LiveSchool
  const watch = { id: 'w1', lastSeats: 0, school: 'gsu', term: '202701', crn: '14257', courseCode: 'SOCI 1160', lastAlertAt: null, alertCount: 0, user: { phone: '+14045550123' } }
  const group = { term: '202701', crn: '14257', watchIds: ['w1'] }
  const poll = (section: Record<string, unknown>) => {
    vi.mocked(bannerFor).mockReturnValue({ searchByCrn: vi.fn(async () => section) } as never)
    return pollGroup(school, group, [watch])
  }

  it('skips a throttled poll without diffing, alerting, or throwing', async () => {
    vi.clearAllMocks()
    vi.mocked(bannerFor).mockReturnValue({ searchByCrn: vi.fn(async () => { throw new BannerThrottledError('throttled') }) } as never)
    await expect(pollGroup(school, group, [watch])).resolves.toBe('throttled')
    expect(applyDiff).not.toHaveBeenCalled()
    expect(scheduleSeatAlert).not.toHaveBeenCalled()
  })

  it('still throws when the section is missing, so real errors count toward the breaker', async () => {
    vi.clearAllMocks()
    vi.mocked(bannerFor).mockReturnValue({ searchByCrn: vi.fn(async () => null) } as never)
    await expect(pollGroup(school, group, [watch])).rejects.toThrow(/returned null/)
  })

  it('sends nothing for a seat held for the waitlist', async () => {
    vi.clearAllMocks()
    vi.mocked(applyDiff).mockResolvedValue({ transition: null, seatEventId: null })
    vi.mocked(claimAlertSlot).mockResolvedValue(null)
    await poll({ seatsShown: 1, takeableSeats: 0, waitCount: 12 })
    expect(applyDiff).toHaveBeenCalledWith(watch, 0)
    expect(scheduleSeatAlert).not.toHaveBeenCalled()
  })

  it('alerts with the takeable count once the waitlist clears', async () => {
    vi.clearAllMocks()
    vi.mocked(applyDiff).mockResolvedValue({ transition: '0_to_N', seatEventId: 'e1' })
    vi.mocked(claimAlertSlot).mockResolvedValue({ alertNumber: 1, retired: false })
    await poll({ seatsShown: 2, takeableSeats: 2, waitCount: 0 })
    expect(applyDiff).toHaveBeenCalledWith(watch, 2)
    expect(scheduleSeatAlert).toHaveBeenCalledWith(expect.objectContaining({ watchId: 'w1', seats: 2 }))
  })
})

describe('laneFilter', () => {
  it("gives the admin's watches to the fast lane only", () => {
    expect(laneFilter('priority', '(404) 555-0123')).toEqual({ user: { phone: '+14045550123' } })
    expect(laneFilter('normal', '(404) 555-0123')).toEqual({ NOT: { user: { phone: '+14045550123' } } })
  })

  it('has no fast lane without ADMIN_PHONE, and the normal lane takes every watch', () => {
    expect(laneFilter('priority', undefined)).toBeNull()
    expect(laneFilter('priority', '  ')).toBeNull()
    expect(laneFilter('normal', undefined)).toEqual({})
  })
})

describe('recordThrottleCycle', () => {
  const gsu = { id: 'gsu', shortName: 'GSU' }
  const gt = { id: 'gatech', shortName: 'Georgia Tech' }
  const run = async (school: typeof gsu, outcome: 'ok' | 'throttled' | 'idle', times: number, notify: (m: string) => Promise<void>) => {
    for (let i = 0; i < times; i++) await recordThrottleCycle(school, outcome, notify)
  }

  it(`texts the admin once after ${THROTTLE_ALERT_CYCLES} throttled cycles in a row`, async () => {
    resetThrottleStreaks()
    const notify = vi.fn(async (msg: string) => { void msg })
    await run(gsu, 'throttled', THROTTLE_ALERT_CYCLES - 1, notify)
    expect(notify).not.toHaveBeenCalled()
    await run(gsu, 'throttled', 1, notify)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0]).toMatch(/GSU/)
    await run(gsu, 'throttled', 10, notify)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('a real answer ends the stretch, so the next stretch can text again', async () => {
    resetThrottleStreaks()
    const notify = vi.fn(async (msg: string) => { void msg })
    await run(gsu, 'throttled', THROTTLE_ALERT_CYCLES, notify)
    await run(gsu, 'ok', 1, notify)
    await run(gsu, 'throttled', THROTTLE_ALERT_CYCLES - 1, notify)
    expect(notify).toHaveBeenCalledTimes(1)
    await run(gsu, 'throttled', 1, notify)
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it('an idle cycle neither counts nor resets', async () => {
    resetThrottleStreaks()
    const notify = vi.fn(async (msg: string) => { void msg })
    await run(gsu, 'throttled', THROTTLE_ALERT_CYCLES - 1, notify)
    await run(gsu, 'idle', 3, notify)
    await run(gsu, 'throttled', 1, notify)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('counts each school on its own', async () => {
    resetThrottleStreaks()
    const notify = vi.fn(async (msg: string) => { void msg })
    await run(gsu, 'throttled', THROTTLE_ALERT_CYCLES - 1, notify)
    await run(gt, 'throttled', THROTTLE_ALERT_CYCLES - 1, notify)
    expect(notify).not.toHaveBeenCalled()
  })

  it('a failed text does not throw out of the loop', async () => {
    resetThrottleStreaks()
    const notify = vi.fn(async (msg: string) => { throw new Error(`bluebubbles down: ${msg}`) })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(run(gsu, 'throttled', THROTTLE_ALERT_CYCLES, notify)).resolves.toBeUndefined()
  })
})
