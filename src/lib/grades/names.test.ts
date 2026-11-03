import { describe, it, expect } from 'vitest'
import { parseName, sameInstructor, normalizeCourse } from './names'

// Real displayName strings from GSU Banner, MATH 2212, Spring 2025
describe('parseName', () => {
  it('reads a plain name with a middle initial', () => {
    expect(parseName('Miller, Joshua G.')).toEqual({ last: 'miller', first: 'joshua', preferred: null })
  })

  it('drops a preferred name that repeats the first name', () => {
    expect(parseName('Baroonian, Mona (Mona) ')).toEqual({ last: 'baroonian', first: 'mona', preferred: null })
  })

  it('keeps a preferred name that differs', () => {
    expect(parseName('Smith, Robert (Bob) A.')).toEqual({ last: 'smith', first: 'robert', preferred: 'bob' })
  })

  it('keeps a two-word last name whole', () => {
    expect(parseName('Benitez Ulloa, Felipe (Felipe) I.')?.last).toBe('benitez ulloa')
  })

  it('ignores stray spaces and periods', () => {
    expect(parseName('Rusodimos, Iason  .')).toEqual({ last: 'rusodimos', first: 'iason', preferred: null })
  })

  it('folds accents and hyphens', () => {
    expect(parseName('Núñez-García, José')?.last).toBe('nunez garcia')
  })

  it('gives up on a name without a comma, or with a part missing', () => {
    expect(parseName('Staff')).toBeNull()
    expect(parseName('Miller,')).toBeNull()
    expect(parseName(', Joshua')).toBeNull()
    expect(parseName(null)).toBeNull()
  })
})

describe('sameInstructor', () => {
  it('matches the same name written two ways', () => {
    expect(sameInstructor('Miller, Joshua G.', 'MILLER, JOSHUA')).toBe(true)
    expect(sameInstructor('Baroonian, Mona (Mona) ', 'Baroonian, Mona')).toBe(true)
  })

  it('matches a full name to an initial', () => {
    expect(sameInstructor('Miller, Joshua G.', 'Miller, J')).toBe(true)
  })

  it('matches a preferred name to a legal one', () => {
    expect(sameInstructor('Smith, Robert (Bob) A.', 'Smith, Bob')).toBe(true)
    expect(sameInstructor('Smith, Bob', 'Smith, Robert (Bob) A.')).toBe(true)
  })

  it('keeps two people with the same last name and initial apart', () => {
    expect(sameInstructor('Miller, Joshua G.', 'Miller, James')).toBe(false)
  })

  it('keeps different last names apart', () => {
    expect(sameInstructor('Fanoe, Andrew L.', 'Faulk, Andrew')).toBe(false)
    expect(sameInstructor('Benitez Ulloa, Felipe', 'Ulloa, Felipe')).toBe(false)
  })

  it('never matches Staff or a missing name', () => {
    expect(sameInstructor('Staff', 'Staff')).toBe(false)
    expect(sameInstructor(null, 'Miller, Joshua')).toBe(false)
  })
})

describe('normalizeCourse', () => {
  it('puts one space between subject and number', () => {
    expect(normalizeCourse('MATH2212')).toBe('MATH 2212')
    expect(normalizeCourse('math  2212')).toBe('MATH 2212')
    expect(normalizeCourse('CSC 1301L')).toBe('CSC 1301L')
  })
})
