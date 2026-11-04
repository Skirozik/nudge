import { describe, it, expect } from 'vitest'
import { localNow, dateProblem } from './timezone'

const NOW = new Date('2026-11-03T22:30:00Z') // Tue Nov 3 2026, 5:30 PM Eastern
const NY = 'America/New_York'

describe('localNow', () => {
  it('includes the year', () => {
    expect(localNow(NOW, NY)).toBe('Tue, Nov 3, 2026, 5:30 PM')
  })

  it('uses their timezone', () => {
    expect(localNow(NOW, 'America/Los_Angeles')).toBe('Tue, Nov 3, 2026, 2:30 PM')
  })

  it('falls back to Eastern on a bad timezone', () => {
    expect(localNow(NOW, 'Not/AZone')).toBe('Tue, Nov 3, 2026, 5:30 PM')
  })
})

describe('dateProblem', () => {
  it("rejects the real case: 'this Friday' saved as Nov 8 2024", () => {
    const problem = dateProblem(new Date('2024-11-08T22:00:00Z'), NY, NOW)
    expect(problem).toMatch(/in the past/)
    expect(problem).toContain('Tue, Nov 3, 2026')
  })

  it('allows a future date', () => {
    expect(dateProblem(new Date('2026-11-06T22:00:00Z'), NY, NOW)).toBeNull()
  })

  it('allows a time a few minutes ago, for "remind me now" and slow replies', () => {
    expect(dateProblem(new Date(NOW.getTime() - 5 * 60_000), NY, NOW)).toBeNull()
  })

  it('rejects earlier today', () => {
    expect(dateProblem(new Date(NOW.getTime() - 60 * 60_000), NY, NOW)).toMatch(/in the past/)
  })

  it('rejects a date it cannot read', () => {
    expect(dateProblem(new Date('not a date'), NY, NOW)).toMatch(/couldn't be read/)
  })
})
