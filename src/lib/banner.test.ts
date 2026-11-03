import { describe, it, expect } from 'vitest'
import { parse, primaryInstructor, displayInstructor, clockTime } from './banner'

// GSU MATH 2212, Spring 2025, CRN 19193: Banner lists the TA first
const CRN_19193 = [
  { displayName: 'Faulk, Jack (Jack) C.', primaryIndicator: false },
  { displayName: 'Miller, Joshua G.', primaryIndicator: true },
]

describe('primaryInstructor', () => {
  it('picks the instructor marked primary, not the first one listed', () => {
    expect(primaryInstructor(CRN_19193)).toBe('Miller, Joshua G.')
  })

  it('falls back to the first one when none is marked', () => {
    expect(primaryInstructor([{ displayName: 'Hunter, Rodney G.' }])).toBe('Hunter, Rodney G.')
  })

  it('collapses stray spaces', () => {
    expect(primaryInstructor([{ displayName: 'Rusodimos, Iason  .', primaryIndicator: true }])).toBe('Rusodimos, Iason .')
  })

  it('is null for Staff sections', () => {
    expect(primaryInstructor(undefined)).toBeNull()
    expect(primaryInstructor([])).toBeNull()
  })
})

describe('displayInstructor', () => {
  it('drops a preferred name that repeats the first name', () => {
    expect(displayInstructor('Grinshpon, Mark (Mark) S.')).toBe('Grinshpon, Mark S.')
    expect(displayInstructor('Benitez Ulloa, Felipe (Felipe) I.')).toBe('Benitez Ulloa, Felipe I.')
  })

  it('keeps a preferred name that differs', () => {
    expect(displayInstructor('Su, Jianning (Sam) .')).toBe('Su, Jianning (Sam)')
  })

  it('drops a stray period', () => {
    expect(displayInstructor('Rusodimos, Iason  .')).toBe('Rusodimos, Iason')
  })
})

describe('clockTime', () => {
  it('turns Banner times into 12-hour ones', () => {
    expect(clockTime('0930')).toBe('9:30am')
    expect(clockTime('1400')).toBe('2:00pm')
    expect(clockTime('1200')).toBe('12:00pm')
    expect(clockTime('0005')).toBe('12:05am')
  })

  it('leaves anything else alone', () => {
    expect(clockTime('TBA')).toBe('TBA')
  })
})

describe('parse', () => {
  it('writes a readable label', () => {
    const s = parse({
      courseReferenceNumber: '12936', subject: 'MATH', courseNumber: '2212', sequenceNumber: '032',
      faculty: [{ displayName: 'Grinshpon, Mark (Mark) S.', primaryIndicator: true }],
      meetingsFaculty: [{ meetingTime: { beginTime: '1400', endTime: '1515', tuesday: true, thursday: true } }],
    })
    expect(s.sectionLabel).toBe('Sec 032, TTh 2:00pm–3:15pm, Grinshpon, Mark S.')
    // Grade matching keeps Banner's own spelling
    expect(s.instructor).toBe('Grinshpon, Mark (Mark) S.')
  })

  it('labels the section with its instructor of record', () => {
    const s = parse({ courseReferenceNumber: '19193', subject: 'MATH', courseNumber: '2212', sequenceNumber: '008', faculty: CRN_19193 })
    expect(s.instructor).toBe('Miller, Joshua G.')
    expect(s.sectionLabel).toContain('Miller, Joshua G.')
    expect(s.sectionLabel).not.toContain('Faulk')
  })

  it('says Staff when no one is assigned', () => {
    const s = parse({ courseReferenceNumber: '1', subject: 'CSC', courseNumber: '1301', sequenceNumber: '001' })
    expect(s.instructor).toBeNull()
    expect(s.sectionLabel).toContain('Staff')
  })
})
