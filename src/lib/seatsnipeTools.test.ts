import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('./watches', () => ({
  createWatch: vi.fn(),
  logMetric: vi.fn(),
}))
vi.mock('./banner', () => ({
  bannerFor: vi.fn(),
}))
vi.mock('./grades/stats', () => ({
  gradesByInstructor: vi.fn(async () => new Map()),
}))

import { watchCourse, setSchool, NEED_SCHOOL_MESSAGE, PENDING_WATCH_TTL_MS } from './seatsnipeTools'
import { prisma } from './prisma'
import { createWatch, logMetric } from './watches'
import { bannerFor } from './banner'
import { gradesByInstructor } from './grades/stats'
import { SCHOOLS, type School } from './schools'

const findUser = prisma.user.findUnique as ReturnType<typeof vi.fn>
const updateUser = prisma.user.update as ReturnType<typeof vi.fn>
const mockCreateWatch = createWatch as ReturnType<typeof vi.fn>
const mockLogMetric = logMetric as ReturnType<typeof vi.fn>
const mockBannerFor = bannerFor as ReturnType<typeof vi.fn>
const mockGrades = gradesByInstructor as ReturnType<typeof vi.fn>

const SECTIONS = [
  { crn: '90474', courseCode: 'CSC 1301', sectionLabel: 'Sec 010, MWF 9–9:50, Jones, Ann', seatsShown: 0, takeableSeats: 0, waitCount: 0, maximumEnrollment: 40, instructor: 'Jones, Ann' },
  { crn: '90476', courseCode: 'CSC 1301', sectionLabel: 'Sec 002, MWF 9–9:50, Smith, Bo', seatsShown: 3, takeableSeats: 3, waitCount: 0, maximumEnrollment: 40, instructor: 'Smith, Bo' },
  { crn: '90477', courseCode: 'CSC 1301', sectionLabel: 'Sec 004, TTh 2:00pm–3:15pm, Lee, Kim', seatsShown: 2, takeableSeats: 0, waitCount: 12, maximumEnrollment: 40, instructor: 'Lee, Kim' },
]
const fakeBanner = {
  getActiveTerm: vi.fn(async () => '202701'),
  normalizeSubject: vi.fn((s: string) => (s.toUpperCase() === 'CSCI' ? 'CSC' : s.toUpperCase())),
  searchByCourse: vi.fn(async () => SECTIONS),
  sectionComment: vi.fn(async (): Promise<string | null> => null),
}

beforeEach(() => {
  vi.clearAllMocks()
  updateUser.mockResolvedValue({})
  mockBannerFor.mockReturnValue(fakeBanner)
  mockCreateWatch.mockResolvedValue({ watch: { id: 'w1' } })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('watchCourse guardrail', () => {
  it('refuses without a school, saves the request, and never touches Banner', async () => {
    findUser.mockResolvedValueOnce({ school: null, source: null })

    const result = await watchCourse('u1', { query: 'CSC 1301' })

    expect(result).toMatchObject({ needsSchool: true, message: NEED_SCHOOL_MESSAGE, schools: ['GSU'] })
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { pendingWatchQuery: 'CSC 1301', pendingWatchAt: expect.any(Date) },
    })
    expect(mockBannerFor).not.toHaveBeenCalled()
    expect(mockCreateWatch).not.toHaveBeenCalled()
  })

  it('refuses when the saved school is not live', async () => {
    findUser.mockResolvedValueOnce({ school: 'gatech', source: null })

    const result = await watchCourse('u1', { query: 'CS 1332' })

    expect(result.error).toMatch(/isn't running at Georgia Tech/)
    expect(mockBannerFor).not.toHaveBeenCalled()
  })

  it('creates the watch at the student\'s school with the seats Banner returned', async () => {
    findUser.mockResolvedValueOnce({ school: 'gsu', source: 'reddit' })

    const result = await watchCourse('u1', { query: 'csci 1301 90476' })

    expect(mockBannerFor).toHaveBeenCalledWith('gsu')
    expect(mockCreateWatch).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', school: 'gsu', term: '202701', crn: '90476', initialSeats: 3, source: 'reddit' })
    )
    expect(result).toMatchObject({ success: true, school: 'GSU', crn: '90476' })
  })

  it('lists sections when no CRN is given', async () => {
    findUser.mockResolvedValueOnce({ school: 'gsu', source: null })

    const result = await watchCourse('u1', { query: 'CSC 1301' })

    expect(result.sections).toHaveLength(3)
    expect(mockCreateWatch).not.toHaveBeenCalled()
  })

  it('shows held seats as 0, with the waitlist next to them', async () => {
    findUser.mockResolvedValueOnce({ school: 'gsu', source: null })
    const sections = (await watchCourse('u1', { query: 'CSC 1301' })).sections as Array<Record<string, unknown>>
    expect(sections[2]).toMatchObject({ crn: '90477', seats: 0, onWaitlist: 12, seatsHeldForWaitlist: 2 })
    expect(sections[1]).toMatchObject({ crn: '90476', seats: 3 })
    expect(sections[1]).not.toHaveProperty('onWaitlist')
  })

  it('starts a watch on held seats at 0, so it can still alert when they free up', async () => {
    findUser.mockResolvedValueOnce({ school: 'gsu', source: null })
    const result = await watchCourse('u1', { query: 'CSC 1301 90477' })
    expect(mockCreateWatch).toHaveBeenCalledWith(expect.objectContaining({ crn: '90477', initialSeats: 0 }))
    expect(result).toMatchObject({ success: true, seats: 0, onWaitlist: 12 })
  })

  it("passes along the school's note on a new watch", async () => {
    findUser.mockResolvedValueOnce({ school: 'gsu', source: null })
    fakeBanner.sectionComment.mockResolvedValueOnce('Includes reserved seats for students in the online BA program.')
    const result = await watchCourse('u1', { query: 'CSC 1301 90476' })
    expect(result.sectionNote).toMatch(/reserved seats/)
  })

  it("puts each professor's grade history on their own sections only", async () => {
    findUser.mockResolvedValueOnce({ school: 'gsu', source: null })
    const jones = { avgGpa: 3.1, dfwRate: 0.16, students: 412, sections: 9, since: 'Spring 2024' }
    mockGrades.mockResolvedValueOnce(new Map([['Jones, Ann', jones]]))

    const result = await watchCourse('u1', { query: 'CSC 1301' })

    expect(mockGrades).toHaveBeenCalledWith('gsu', 'CSC 1301', '202701', ['Jones, Ann', 'Smith, Bo', 'Lee, Kim'])
    const [first, second] = result.sections as Array<Record<string, unknown>>
    expect(first.professorGrades).toEqual(jones)
    expect(second).not.toHaveProperty('professorGrades')
  })
})

describe('setSchool', () => {
  it('says "coming soon" for a known school that is not live, and records the demand', async () => {
    const result = await setSchool('u1', { school: 'Kennesaw State' })

    expect(result).toEqual({ comingSoon: true, message: "SeatSnipe isn't at Kennesaw State yet, but it's coming soon!" })
    expect(mockLogMetric).toHaveBeenCalledWith('school_requested', 'u1', { said: 'Kennesaw State', schoolId: 'kennesaw' })
    // School is not saved, and the stranded request is dropped
    expect(updateUser).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { pendingWatchQuery: null, pendingWatchAt: null } })
  })

  it('uses the name as typed for a school it does not know', async () => {
    const result = await setSchool('u1', { school: 'Emory' })

    expect(result.message).toBe("SeatSnipe isn't at Emory yet, but it's coming soon!")
    expect(mockLogMetric).toHaveBeenCalledWith('school_requested', 'u1', { said: 'Emory', schoolId: null })
  })

  it('saves a live school and runs the request saved before they picked it', async () => {
    findUser
      .mockResolvedValueOnce({ school: null, pendingWatchQuery: 'CSC 1301', pendingWatchAt: new Date() })
      .mockResolvedValueOnce({ school: 'gsu', source: null }) // watchCourse re-reads the user

    const result = await setSchool('u1', { school: 'georgia state' })

    expect(updateUser).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { school: 'gsu', pendingWatchQuery: null, pendingWatchAt: null },
    })
    expect(result).toMatchObject({ success: true, school: 'GSU', savedRequest: 'CSC 1301' })
    expect((result.savedRequestResult as { sections: unknown[] }).sections).toHaveLength(3)
  })

  it('drops a saved request older than 24 hours', async () => {
    const stale = new Date(Date.now() - PENDING_WATCH_TTL_MS - 60_000)
    findUser.mockResolvedValueOnce({ school: null, pendingWatchQuery: 'CSC 1301', pendingWatchAt: stale })

    const result = await setSchool('u1', { school: 'GSU' })

    expect(result).toEqual({ success: true, school: 'GSU' })
    expect(mockBannerFor).not.toHaveBeenCalled()
  })

  describe('switching schools', () => {
    const testU: School = {
      id: 'testu',
      name: 'Test University',
      shortName: 'Test U',
      aliases: ['test u'],
      banner: { baseUrl: 'https://example.edu/StudentRegistrationSsb', registerSite: 'example.edu', subjectAliases: {} },
    }
    beforeEach(() => {
      SCHOOLS.push(testU)
      vi.stubEnv('ENABLED_SCHOOLS', 'gsu,testu')
    })
    afterEach(() => {
      SCHOOLS.splice(SCHOOLS.indexOf(testU), 1)
    })

    it('changes the school for new watches and leaves existing watches alone', async () => {
      findUser.mockResolvedValueOnce({ school: 'gsu', pendingWatchQuery: null, pendingWatchAt: null })

      const result = await setSchool('u1', { school: 'Test U' })

      expect(result).toMatchObject({ success: true, school: 'Test U', switchedFrom: 'GSU' })
      expect(updateUser).toHaveBeenCalledOnce()
      expect(updateUser).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { school: 'testu', pendingWatchQuery: null, pendingWatchAt: null },
      })
    })
  })
})
