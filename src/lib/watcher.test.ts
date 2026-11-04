import { describe, it, expect, vi } from 'vitest'

vi.mock('./prisma', () => ({ prisma: {} }))
vi.mock('./banner', () => ({ bannerFor: vi.fn() }))
vi.mock('./queue', () => ({ scheduleSeatAlert: vi.fn() }))
vi.mock('./redis', () => ({ isSurgeMode: vi.fn() }))
vi.mock('./watches', () => ({ applyDiff: vi.fn(), claimAlertSlot: vi.fn(), releaseAlertSlot: vi.fn(), logMetric: vi.fn(), MAX_ALERTS_PER_WATCH: 3 }))

import { laneFilter, pollGroup } from './watcher'
import { bannerFor } from './banner'
import { applyDiff, claimAlertSlot } from './watches'
import { scheduleSeatAlert } from './queue'
import type { LiveSchool } from './schools'

describe('pollGroup', () => {
  const school = { id: 'gsu' } as LiveSchool
  const watch = { id: 'w1', lastSeats: 0, school: 'gsu', term: '202701', crn: '14257', courseCode: 'SOCI 1160', lastAlertAt: null, alertCount: 0, user: { phone: '+14045550123' } }
  const group = { term: '202701', crn: '14257', watchIds: ['w1'] }
  const poll = (section: Record<string, unknown>) => {
    vi.mocked(bannerFor).mockReturnValue({ searchByCrn: vi.fn(async () => section) } as never)
    return pollGroup(school, group, [watch])
  }

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
