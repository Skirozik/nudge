import { describe, it, expect, vi } from 'vitest'

vi.mock('./prisma', () => ({ prisma: {} }))
vi.mock('./banner', () => ({ bannerFor: vi.fn() }))
vi.mock('./queue', () => ({ scheduleSeatAlert: vi.fn() }))
vi.mock('./redis', () => ({ isSurgeMode: vi.fn() }))
vi.mock('./watches', () => ({ applyDiff: vi.fn(), claimAlertSlot: vi.fn(), releaseAlertSlot: vi.fn(), logMetric: vi.fn(), MAX_ALERTS_PER_WATCH: 3 }))

import { laneFilter } from './watcher'

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
