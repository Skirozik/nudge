import { describe, it, expect } from 'vitest'
import { parse, primaryInstructor, displayInstructor, clockTime, takeableSeats, parseSectionComment } from './banner'

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

// Real GSU Spring 2027 numbers. The first two were tried in GoSOLAR and refused.
describe('takeableSeats', () => {
  it('counts none when people are waiting and there are fewer seats than people', () => {
    // SOCI 1160 CRN 14257: "Open - Reserved for Wait List"
    expect(takeableSeats({ seatsAvailable: 1, waitCount: 12 })).toBe(0)
  })

  it('counts none when people are waiting, even with more seats than people', () => {
    // POLS 3800 CRN 16225: "Open seats are reserved for specific student groups"
    expect(takeableSeats({ seatsAvailable: 2, waitCount: 1 })).toBe(0)
  })

  it('counts the seats when nobody is waiting', () => {
    // CSC 4350 CRN 10104, cross-listed with room in the pool
    expect(takeableSeats({ seatsAvailable: 39, waitCount: 0, crossListAvailable: 44 })).toBe(39)
  })

  it('counts none when the cross-listed pool is full', () => {
    expect(takeableSeats({ seatsAvailable: 2, waitCount: 0, crossListAvailable: 0 })).toBe(0)
  })

  it('caps at what is left in the cross-listed pool', () => {
    expect(takeableSeats({ seatsAvailable: 5, waitCount: 0, crossListAvailable: 2 })).toBe(2)
  })

  it('ignores the pool when the section is not cross-listed', () => {
    expect(takeableSeats({ seatsAvailable: 5, waitCount: 0, crossListAvailable: null })).toBe(5)
  })

  it('handles over-enrolled sections and a school that sends no waitlist data', () => {
    expect(takeableSeats({ seatsAvailable: -3, waitCount: 0 })).toBe(0)
    expect(takeableSeats({ seatsAvailable: 4 })).toBe(4)
  })
})

describe('parseSectionComment', () => {
  const panel = (comment: string) =>
    `<span>Subject Comments:</span><section>None</section><span>Course Comments:</span><section><p>Critical Thinking.</p><p>Critical Thinking.</p></section><!-- note --><span>Section Comments:</span><section>${comment}</section>`

  it('reads the section note', () => {
    expect(parseSectionComment(panel('Includes reserved seats for students in the Political Science online BA program.'))).toBe(
      'Includes reserved seats for students in the Political Science online BA program.'
    )
  })

  it('is null when the note says None, or the panel has no section comments', () => {
    expect(parseSectionComment(panel('None'))).toBeNull()
    expect(parseSectionComment('<html>Sign in</html>')).toBeNull()
  })

  it('drops a repeated line', () => {
    expect(parseSectionComment(panel('<p>Honors only.</p><p>Honors only.</p>'))).toBe('Honors only.')
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
  it('keeps what the site shows apart from what a student can get', () => {
    const s = parse({ courseReferenceNumber: '14257', subject: 'SOCI', courseNumber: '1160', sequenceNumber: '006', seatsAvailable: 1, waitCount: 12 })
    expect(s).toMatchObject({ seatsShown: 1, takeableSeats: 0, waitCount: 12 })
  })

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
