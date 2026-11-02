import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DEFAULT_PAID_FROM, parsePaidFrom, paidFromLabel } from './paidFrom'

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('parsePaidFrom', () => {
  it('defaults to Nov 20 2026, 12:00 AM Eastern', () => {
    expect(DEFAULT_PAID_FROM.toISOString()).toBe('2026-11-20T05:00:00.000Z')
    expect(parsePaidFrom(undefined)).toBe(DEFAULT_PAID_FROM)
    expect(parsePaidFrom('  ')).toBe(DEFAULT_PAID_FROM)
  })

  it('takes a full ISO time with an offset or Z', () => {
    expect(parsePaidFrom('2026-11-27T00:00:00-05:00').toISOString()).toBe('2026-11-27T05:00:00.000Z')
    expect(parsePaidFrom('2026-11-27T05:00Z').toISOString()).toBe('2026-11-27T05:00:00.000Z')
  })

  // Each of these parses to some date in JS, just not the one meant
  it.each(['Nov 27', '2026-11-27', '11/27/2026', '2026-11-27T00:00:00', 'soon', '2062-11-27T00:00:00-05:00'])(
    'keeps the default for %s',
    (raw) => {
      expect(parsePaidFrom(raw)).toBe(DEFAULT_PAID_FROM)
      expect(console.warn).toHaveBeenCalled()
    },
  )
})

describe('paidFromLabel', () => {
  it('formats the date in Eastern time', () => {
    expect(paidFromLabel()).toBe('Nov 20')
    expect(paidFromLabel(DEFAULT_PAID_FROM, true)).toBe('Nov 20, 2026')
    // 11:59 PM Eastern on Nov 19 is still Nov 19, though it's Nov 20 in UTC
    expect(paidFromLabel(new Date('2026-11-20T04:59:00Z'))).toBe('Nov 19')
  })
})
