import { describe, it, expect } from 'vitest'
import { semesterOf, endOfNextSemester } from './semester'

describe('semesterOf', () => {
  it('names the semester in Eastern time', () => {
    expect(semesterOf(new Date('2026-11-02T17:00:00Z'))).toBe('2026-fall')
    expect(semesterOf(new Date('2027-03-15T12:00:00Z'))).toBe('2027-spring')
  })

  it('9 PM Eastern on Dec 31 is still fall, though it is Jan 1 in UTC', () => {
    expect(semesterOf(new Date('2027-01-01T02:00:00Z'))).toBe('2026-fall')
  })

  it('spring starts at midnight Eastern on Jan 1', () => {
    expect(semesterOf(new Date('2027-01-01T05:00:00Z'))).toBe('2027-spring')
  })

  it('summer is part of spring, through 11:59 PM Eastern on Jul 31', () => {
    expect(semesterOf(new Date('2027-06-15T12:00:00Z'))).toBe('2027-spring')
    expect(semesterOf(new Date('2027-08-01T03:59:00Z'))).toBe('2027-spring')
    expect(semesterOf(new Date('2027-08-01T04:00:00Z'))).toBe('2027-fall')
  })
})

describe('endOfNextSemester', () => {
  it('a free class earned in fall lasts through spring', () => {
    expect(endOfNextSemester(new Date('2026-11-21T12:00:00Z')).toISOString()).toBe('2027-08-01T03:59:59.999Z')
  })

  it('a free class earned in spring lasts through fall', () => {
    expect(endOfNextSemester(new Date('2027-03-15T12:00:00Z')).toISOString()).toBe('2028-01-01T04:59:59.999Z')
  })

  it('uses the Eastern date at the edges', () => {
    // 11:59 PM Eastern Jul 31, still spring
    expect(endOfNextSemester(new Date('2027-08-01T03:59:00Z')).toISOString()).toBe('2028-01-01T04:59:59.999Z')
    // 9 PM Eastern Dec 31, still fall
    expect(endOfNextSemester(new Date('2027-01-01T02:00:00Z')).toISOString()).toBe('2027-08-01T03:59:59.999Z')
  })
})
