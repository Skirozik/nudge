import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BannerClient, NULLS_BEFORE_RELOGIN, RELOGIN_MIN_GAP_MS } from './banner'
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

describe('dropping a session after a run of data: null answers', () => {
  const NULL_BODY = { success: true, totalCount: 0, data: null }
  const REAL_BODY = { success: true, totalCount: 0, data: [] }

  /** searchResults answers with the next body in the list. Counts fresh logins. */
  function scriptedFetch(bodies: unknown[]) {
    const queue = [...bodies]
    return vi.fn(async (url: string) => {
      if (url.includes('/ssb/term/search')) return new Response(JSON.stringify({ fwdURL: '/StudentRegistrationSsb/ssb/classSearch/classSearch' }), { status: 200 })
      if (url.includes('/ssb/searchResults/searchResults')) return new Response(JSON.stringify(queue.shift()), { status: 200 })
      if (url.endsWith('/ssb/registration')) return new Response(null, { status: 200, headers: { 'set-cookie': 'JSESSIONID=abc; Path=/' } })
      return new Response(null, { status: 200 })
    })
  }
  const logins = () => (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => String(c[0]).includes('/ssb/term/search')).length

  async function search(client: BannerClient, advanceMs = 1000): Promise<void> {
    vi.setSystemTime(Date.now() + advanceMs)
    await client.searchByCourse('202702', 'CS', '1331').catch(() => {})
  }

  beforeEach(() => {
    // The 500ms limiter sleeps for real on every login step. Skip it here.
    vi.spyOn(BannerClient.prototype as unknown as { rateLimit: () => Promise<void> }, 'rateLimit').mockResolvedValue(undefined)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it(`logs in fresh after ${NULLS_BEFORE_RELOGIN} nulls in a row, never sooner`, async () => {
    vi.stubGlobal('fetch', scriptedFetch([NULL_BODY, NULL_BODY, NULL_BODY, REAL_BODY]))
    const client = new BannerClient(SCHOOL)

    await search(client)
    await search(client)
    expect(logins()).toBe(1)
    await search(client) // third null drops the session
    expect(logins()).toBe(1) // no immediate retry
    await search(client)
    expect(logins()).toBe(2)
  })

  it('drops the session at most once per 10 minutes', async () => {
    vi.stubGlobal('fetch', scriptedFetch(Array(10).fill(NULL_BODY)))
    const client = new BannerClient(SCHOOL)

    for (let i = 0; i < 3; i++) await search(client)
    await search(client) // logs in again after the drop, still null
    expect(logins()).toBe(2)
    for (let i = 0; i < 4; i++) await search(client) // more nulls inside the 10 minutes
    expect(logins()).toBe(2)

    await search(client, RELOGIN_MIN_GAP_MS) // 10 minutes later, this null drops it again
    await search(client)
    expect(logins()).toBe(3)
  })

  it('starts the count over after a real answer', async () => {
    vi.stubGlobal('fetch', scriptedFetch([NULL_BODY, NULL_BODY, REAL_BODY, NULL_BODY, NULL_BODY, REAL_BODY, NULL_BODY, REAL_BODY]))
    const client = new BannerClient(SCHOOL)

    for (let i = 0; i < 7; i++) await search(client)
    expect(logins()).toBe(1) // never three nulls in a row
    await search(client)
    expect(logins()).toBe(1)
  })
})
