import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./redis', () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}))

import { BannerClient } from './banner'
import { redis } from './redis'
import type { LiveSchool } from './schools'

const mockGet = redis.get as ReturnType<typeof vi.fn>
const mockSet = redis.set as ReturnType<typeof vi.fn>
const mockDel = redis.del as ReturnType<typeof vi.fn>

const FAKE_SCHOOL: LiveSchool = {
  id: 'testschool',
  name: 'Test School',
  shortName: 'Test',
  aliases: ['test'],
  banner: { baseUrl: 'https://example.edu/StudentRegistrationSsb', registerSite: 'example.edu', subjectAliases: {} },
}

function cookieHeaders(cookie: string): Headers {
  const h = new Headers()
  h.append('set-cookie', cookie)
  return h
}

/** Fakes the three-step login + resetDataForm + searchResults sequence banner.ts drives. */
function makeFetchMock(sections: unknown[] = []) {
  return vi.fn(async (url: string) => {
    if (url.includes('/ssb/registration')) return new Response(null, { status: 200, headers: cookieHeaders('JSESSIONID=fresh-login') })
    if (url.includes('/ssb/term/search')) return new Response(JSON.stringify({ fwdURL: '/StudentRegistrationSsb/ssb/classSearch/classSearch' }), { status: 200 })
    if (url.includes('/ssb/classSearch/classSearch')) return new Response(null, { status: 200 })
    if (url.includes('/ssb/classSearch/resetDataForm')) return new Response(null, { status: 200 })
    if (url.includes('/ssb/searchResults/searchResults')) return new Response(JSON.stringify({ data: sections }), { status: 200 })
    throw new Error(`unexpected fetch in test: ${url}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', makeFetchMock())
})

describe('BannerClient shared session', () => {
  it('logs in once and reuses the session across repeated searches on the same process', async () => {
    mockGet.mockResolvedValue(null) // nobody has published a session yet
    mockSet.mockResolvedValue('OK') // this process wins the login lock

    const client = new BannerClient(FAKE_SCHOOL)
    await client.searchByCourse('202702', 'CS', '1331')
    await client.searchByCourse('202702', 'CS', '1331')

    const fetchMock = fetch as ReturnType<typeof vi.fn>
    // 3 login requests (registration, term/search, classSearch) + 2x (resetDataForm + searchResults) = 7.
    // If it had logged in twice this would be 10.
    expect(fetchMock).toHaveBeenCalledTimes(7)
  })

  it('uses a session another process already published, without logging in itself', async () => {
    mockGet.mockResolvedValue(JSON.stringify({ cookies: 'JSESSIONID=from-another-process' }))

    const client = new BannerClient(FAKE_SCHOOL)
    await client.searchByCourse('202702', 'CS', '1331')

    const fetchMock = fetch as ReturnType<typeof vi.fn>
    // Only resetDataForm + searchResults — no registration/term/search/classSearch login calls.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mockSet).not.toHaveBeenCalled() // never tried to claim the login lock
  })

  it('waits for a concurrent login rather than logging in twice, when the holder publishes in time', async () => {
    mockSet.mockResolvedValue(null) // another process already holds the login lock
    mockGet
      .mockResolvedValueOnce(null) // first check, before attempting the lock
      .mockResolvedValueOnce(null) // wait attempt 1: not published yet
      .mockResolvedValueOnce(JSON.stringify({ cookies: 'JSESSIONID=published-by-holder' })) // wait attempt 2: there it is

    const client = new BannerClient(FAKE_SCHOOL)
    await client.searchByCourse('202702', 'CS', '1331')

    const fetchMock = fetch as ReturnType<typeof vi.fn>
    expect(fetchMock).toHaveBeenCalledTimes(2) // no login fetches — reused what the other process published
  })

  it('logs in itself if the lock holder never publishes a session', async () => {
    mockSet.mockResolvedValue(null) // another process holds the lock the whole time
    mockGet.mockResolvedValue(null) // and never publishes anything

    const client = new BannerClient(FAKE_SCHOOL)
    await client.searchByCourse('202702', 'CS', '1331')

    const fetchMock = fetch as ReturnType<typeof vi.fn>
    // Falls back to logging in itself rather than waiting forever: 3 login + resetDataForm + searchResults.
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('clears the shared session (not just its own) when a search comes back non-JSON', async () => {
    mockGet.mockResolvedValueOnce(JSON.stringify({ cookies: 'JSESSIONID=stale' })) // a stale shared session
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/ssb/classSearch/resetDataForm')) return new Response(null, { status: 200 })
        if (url.includes('/ssb/searchResults/searchResults')) {
          // First call with the stale session returns an HTML login page; after re-login, real JSON.
          const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => String(c[0]).includes('searchResults')).length
          return calls <= 1 ? new Response('<html>login</html>', { status: 200 }) : new Response(JSON.stringify({ data: [] }), { status: 200 })
        }
        if (url.includes('/ssb/registration')) return new Response(null, { status: 200, headers: cookieHeaders('JSESSIONID=fresh-login') })
        if (url.includes('/ssb/term/search')) return new Response(JSON.stringify({ fwdURL: '/StudentRegistrationSsb/ssb/classSearch/classSearch' }), { status: 200 })
        if (url.includes('/ssb/classSearch/classSearch')) return new Response(null, { status: 200 })
        throw new Error(`unexpected fetch in test: ${url}`)
      })
    )
    mockSet.mockResolvedValue('OK')

    const client = new BannerClient(FAKE_SCHOOL)
    await client.searchByCourse('202702', 'CS', '1331')

    expect(mockDel).toHaveBeenCalledWith('banner:session:testschool:202702')
  })
})
