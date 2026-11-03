import { describe, it, expect } from 'vitest'
import { parse, primaryInstructor } from './banner'

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

describe('parse', () => {
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
