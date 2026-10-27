import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must be called before importing the module under test
vi.mock('./prisma', () => ({
  prisma: { user: { count: vi.fn(), findMany: vi.fn() } },
}))
vi.mock('./redis', () => ({
  redis: { set: vi.fn(), getdel: vi.fn() },
}))
vi.mock('./queue', () => ({
  scheduleBroadcast: vi.fn(),
}))

import {
  parseSeatSnipeBroadcast,
  stageSeatSnipeBroadcast,
  sendStagedSeatSnipeBroadcast,
  SEATSNIPE_AUDIENCE,
  PENDING_TTL_SECONDS,
  SEND_SPACING_MS,
} from './broadcast'
import { prisma } from './prisma'
import { redis } from './redis'
import { scheduleBroadcast } from './queue'

const mockCount = prisma.user.count as ReturnType<typeof vi.fn>
const mockFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>
const mockSet = redis.set as ReturnType<typeof vi.fn>
const mockGetdel = redis.getdel as ReturnType<typeof vi.fn>
const mockSchedule = scheduleBroadcast as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

// ── parseSeatSnipeBroadcast ────────────────────────────────────────────────

describe('parseSeatSnipeBroadcast', () => {
  it('returns the message with its casing and line breaks intact', () => {
    expect(parseSeatSnipeBroadcast('BROADCAST SEATSNIPE SeatSnipe is back 🎯\nText me a class')).toBe(
      'SeatSnipe is back 🎯\nText me a class'
    )
  })

  it('matches any case and an optional colon', () => {
    expect(parseSeatSnipeBroadcast('broadcast seatsnipe hi')).toBe('hi')
    expect(parseSeatSnipeBroadcast('Broadcast SeatSnipe: hi')).toBe('hi')
  })

  it('returns empty when the message is missing, so it never falls through to the everyone-broadcast', () => {
    expect(parseSeatSnipeBroadcast('BROADCAST SEATSNIPE')).toBe('')
    expect(parseSeatSnipeBroadcast('BROADCAST SEATSNIPE:  ')).toBe('')
  })

  it('ignores the everyone-broadcast and normal texts', () => {
    expect(parseSeatSnipeBroadcast('BROADCAST happy finals week')).toBeNull()
    expect(parseSeatSnipeBroadcast('watch csc 1301')).toBeNull()
  })
})

// ── audience ───────────────────────────────────────────────────────────────

describe('SEATSNIPE_AUDIENCE', () => {
  it('only reaches students who had a watch or picked a school, and never opted-out ones', () => {
    expect(SEATSNIPE_AUDIENCE).toEqual({
      optedOut: false,
      OR: [{ watches: { some: {} } }, { school: { not: null } }],
    })
  })
})

// ── stage → send ───────────────────────────────────────────────────────────

describe('stageSeatSnipeBroadcast', () => {
  it('holds the message with an expiry and returns the audience size', async () => {
    mockCount.mockResolvedValue(42)
    expect(await stageSeatSnipeBroadcast('back for spring')).toBe(42)
    expect(mockSet).toHaveBeenCalledWith(expect.any(String), 'back for spring', 'EX', PENDING_TTL_SECONDS)
    expect(mockCount).toHaveBeenCalledWith({ where: SEATSNIPE_AUDIENCE })
  })
})

describe('sendStagedSeatSnipeBroadcast', () => {
  it('returns null and sends nothing when no preview is waiting', async () => {
    mockGetdel.mockResolvedValue(null)
    expect(await sendStagedSeatSnipeBroadcast()).toBeNull()
    expect(mockFindMany).not.toHaveBeenCalled()
    expect(mockSchedule).not.toHaveBeenCalled()
  })

  it('queues one spaced-out text per SeatSnipe student', async () => {
    mockGetdel.mockResolvedValue('back for spring')
    mockFindMany.mockResolvedValue([
      { id: 'u1', phone: '+14045550101' },
      { id: 'u2', phone: '+14045550102' },
      { id: 'u3', phone: '+14045550103' },
    ])
    expect(await sendStagedSeatSnipeBroadcast()).toBe(3)
    expect(mockFindMany).toHaveBeenCalledWith({ where: SEATSNIPE_AUDIENCE, select: { id: true, phone: true } })
    expect(mockSchedule.mock.calls).toEqual([
      ['u1', '+14045550101', 'back for spring', 0],
      ['u2', '+14045550102', 'back for spring', SEND_SPACING_MS],
      ['u3', '+14045550103', 'back for spring', 2 * SEND_SPACING_MS],
    ])
  })

  it('reads the preview with GETDEL so a second SEND finds nothing', async () => {
    mockGetdel.mockResolvedValueOnce('back for spring').mockResolvedValueOnce(null)
    mockFindMany.mockResolvedValue([{ id: 'u1', phone: '+14045550101' }])
    expect(await sendStagedSeatSnipeBroadcast()).toBe(1)
    expect(await sendStagedSeatSnipeBroadcast()).toBeNull()
    expect(mockSchedule).toHaveBeenCalledOnce()
  })
})
