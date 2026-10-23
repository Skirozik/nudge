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

import { watchCourse, setSchool, NEED_SCHOOL_MESSAGE, PENDING_WATCH_TTL_MS } from './seatsnipeTools'
import { prisma } from './prisma'
import { createWatch, logMetric } from './watches'
import { bannerFor } from './banner'
import { SCHOOLS, type School } from './schools'

const findUser = prisma.user.findUnique as ReturnType<typeof vi.fn>
const updateUser = prisma.user.update as ReturnType<typeof vi.fn>
const mockCreateWatch = createWatch as ReturnType<typeof vi.fn>
const mockLogMetric = logMetric as ReturnType<typeof vi.fn>
const mockBannerFor = bannerFor as ReturnType<typeof vi.fn>

const SECTIONS = [
  { crn: '90474', courseCode: 'CSC 1301', sectionLabel: 'Sec 010, MWF 9–9:50, Jones', seatsAvailable: 0, maximumEnrollment: 40 },
  { crn: '90476', courseCode: 'CSC 1301', sectionLabel: 'Sec 002, MWF 9–9:50, Smith', seatsAvailable: 3, maximumEnrollment: 40 },
]
const fakeBanner = {
  getActiveTerm: vi.fn(async () => '202701'),
  normalizeSubject: vi.fn((s: string) => (s.toUpperCase() === 'CSCI' ? 'CSC' : s.toUpperCase())),
  searchByCourse: vi.fn(async () => SECTIONS),
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

    expect(result.sections).toHaveLength(2)
    expect(mockCreateWatch).not.toHaveBeenCalled()
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
    expect((result.savedRequestResult as { sections: unknown[] }).sections).toHaveLength(2)
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
