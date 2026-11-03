import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma', () => ({
  prisma: { gradeSection: { findMany: vi.fn() } },
}))

import { summarize, sinceTerm, termLabel, gradesByInstructor, MIN_STUDENTS, type GradeRow } from './stats'
import { prisma } from '../prisma'

const findMany = prisma.gradeSection.findMany as ReturnType<typeof vi.fn>

const row = (over: Partial<GradeRow> = {}): GradeRow => ({
  term: '202501',
  instructor: 'Miller, Joshua',
  a: 10, b: 8, c: 4, d: 1, f: 1, w: 2, wf: 0, other: 0,
  gpa: 3.0,
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('summarize', () => {
  it('weights each section GPA by its letter-graded students', () => {
    // 24 graded at 3.0 and 12 graded at 2.0 → (72 + 24) / 36
    const s = summarize([row(), row({ term: '202408', a: 4, b: 4, c: 2, d: 1, f: 1, w: 0, gpa: 2.0 })])
    expect(s?.avgGpa).toBe(2.67)
    expect(s?.students).toBe(36)
    expect(s?.sections).toBe(2)
  })

  it("matches GSU's own DWF on a real Spring 2026 section", () => {
    // ACCT 2102 CRN 10001: (14 + 5 + 0 + 7) / 334 = 7.8%, the file's DWF column
    const s = summarize([row({ a: 160, b: 106, c: 41, d: 14, f: 5, wf: 0, w: 7, other: 1, gpa: 3.29 })])
    expect(s?.dfwRate).toBe(0.08)
    expect(s?.students).toBe(326)
  })

  it('counts Other in the enrolled total, like GSU does', () => {
    // (1 + 1 + 2) / (24 graded + 2 W + 14 Other) = 10%
    expect(summarize([row({ other: 14 })])?.dfwRate).toBe(0.1)
  })

  it('names the earliest term counted', () => {
    expect(summarize([row({ term: '202501' }), row({ term: '202308' })])?.since).toBe('Fall 2023')
  })

  it(`says nothing under ${MIN_STUDENTS} graded students`, () => {
    expect(summarize([row({ a: 5, b: 5, c: 5, d: 1, f: 1 })])).toBeNull()
  })

  it('says nothing when no section has a GPA', () => {
    expect(summarize([row({ gpa: null, a: 40 })])).toBeNull()
  })

  it('skips a section with no grades at all', () => {
    const empty = row({ a: 0, b: 0, c: 0, d: 0, f: 0, w: 0, wf: 0, other: 90, gpa: null, term: '202108' })
    expect(summarize([row({ a: 30 }), empty])?.sections).toBe(1)
  })

  it('is null for no rows', () => {
    expect(summarize([])).toBeNull()
  })
})

describe('terms', () => {
  it('goes back three years', () => {
    expect(sinceTerm('202701')).toBe('202401')
    expect(sinceTerm('202608')).toBe('202308')
  })

  it('labels terms', () => {
    expect(termLabel('202308')).toBe('Fall 2023')
    expect(termLabel('202601')).toBe('Spring 2026')
    expect(termLabel('202505')).toBe('Summer 2025')
  })
})

describe('gradesByInstructor', () => {
  it("gives each instructor only their own sections", async () => {
    findMany.mockResolvedValue([
      row({ instructor: 'Miller, Joshua', a: 30, gpa: 3.5 }),
      row({ instructor: 'Miller, James', a: 30, gpa: 1.5 }),
    ])
    const m = await gradesByInstructor('gsu', 'MATH 2212', '202701', ['Miller, Joshua G.', null])
    expect(m.get('Miller, Joshua G.')?.avgGpa).toBe(3.5)
    expect(m.size).toBe(1)
  })

  it('only reads past terms inside the window', async () => {
    findMany.mockResolvedValue([])
    await gradesByInstructor('gsu', 'MATH 2212', '202701', ['Miller, Joshua G.'])
    expect(findMany.mock.calls[0][0].where).toEqual({
      school: 'gsu',
      courseCode: 'MATH 2212',
      term: { gte: '202401', lt: '202701' },
    })
  })

  it("doesn't query when every section is Staff", async () => {
    expect((await gradesByInstructor('gsu', 'MATH 2212', '202701', [null, null])).size).toBe(0)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('returns nothing instead of throwing when the database fails', async () => {
    findMany.mockRejectedValue(new Error('db down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await gradesByInstructor('gsu', 'MATH 2212', '202701', ['Miller, Joshua'])).size).toBe(0)
    spy.mockRestore()
  })
})
