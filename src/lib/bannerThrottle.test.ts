import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BannerClient } from './banner'
import { BannerThrottledError } from './bannerErrors'
import type { LiveSchool } from './schools'

const SCHOOL: LiveSchool = {
  id: 'testschool',
  name: 'Test School',
  shortName: 'Test',
  aliases: ['test'],
  banner: { baseUrl: 'https://example.edu/StudentRegistrationSsb', registerSite: 'example.edu', subjectAliases: {} },
}

/** Fakes the login steps, then answers searchResults with whatever body is given. */
function fetchReturning(searchBody: unknown) {
  return vi.fn(async (url: string) => {
    if (url.includes('/ssb/term/search')) return new Response(JSON.stringify({ fwdURL: '/StudentRegistrationSsb/ssb/classSearch/classSearch' }), { status: 200 })
    if (url.includes('/ssb/searchResults/searchResults')) return new Response(JSON.stringify(searchBody), { status: 200 })
    return new Response(null, { status: 200 })
  })
}

const searchCalls = () => (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => String(c[0]).includes('searchResults/searchResults')).length

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('Banner silent throttle (200 with data: null)', () => {
  it('throws from searchByCourse instead of returning no sections', async () => {
    vi.stubGlobal('fetch', fetchReturning({ success: true, totalCount: 0, data: null }))
    await expect(new BannerClient(SCHOOL).searchByCourse('202701', 'CSC', '1301')).rejects.toBeInstanceOf(BannerThrottledError)
  })

  it('throws from searchByCrn instead of returning null', async () => {
    vi.stubGlobal('fetch', fetchReturning({ success: true, totalCount: 0, data: null }))
    await expect(new BannerClient(SCHOOL).searchByCrn('202701', '14257', 'CSC 1301')).rejects.toBeInstanceOf(BannerThrottledError)
  })

  it('does not retry right away', async () => {
    vi.stubGlobal('fetch', fetchReturning({ success: true, totalCount: 0, data: null }))
    await new BannerClient(SCHOOL).searchByCourse('202701', 'CSC', '1301').catch(() => {})
    expect(searchCalls()).toBe(1)
  })

  it('treats data: [] as a genuinely empty class', async () => {
    vi.stubGlobal('fetch', fetchReturning({ success: true, totalCount: 0, data: [] }))
    await expect(new BannerClient(SCHOOL).searchByCourse('202701', 'CSC', '4351')).resolves.toEqual([])
  })

  it('leaves other failures alone, so searchByCrn still returns null on a real error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('searchResults/searchResults') ? new Response('boom', { status: 500 }) : url.includes('/ssb/term/search') ? new Response(JSON.stringify({}), { status: 200 }) : new Response(null, { status: 200 }))))
    await expect(new BannerClient(SCHOOL).searchByCrn('202701', '14257', 'CSC 1301')).resolves.toBeNull()
  })
})
