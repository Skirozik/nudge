import { describe, it, expect, vi } from 'vitest'
import { BannerClient, parse, takeableSeats } from './banner'

describe('waitlistHoldsSeats', () => {
  it('counts the seats when the school lets students register past a waitlist', () => {
    expect(takeableSeats({ seatsAvailable: 2, waitCount: 12 }, false)).toBe(2)
    expect(takeableSeats({ seatsAvailable: 5, waitCount: 3, crossListAvailable: 1 }, false)).toBe(1)
  })

  it('defaults to holding seats, so GSU is unchanged', () => {
    expect(takeableSeats({ seatsAvailable: 2, waitCount: 12 })).toBe(0)
    expect(parse({ seatsAvailable: 2, waitCount: 12 })).toMatchObject({ takeableSeats: 0, heldForWaitlist: true })
  })

  it('marks a section held only when the school holds seats and someone is waiting', () => {
    expect(parse({ seatsAvailable: 0, waitCount: 12 })).toMatchObject({ heldForWaitlist: true }) // full, still shows the waitlist
    expect(parse({ seatsAvailable: 2, waitCount: 0 })).toMatchObject({ heldForWaitlist: false })
    expect(parse({ seatsAvailable: 2, waitCount: 12 }, false)).toMatchObject({ takeableSeats: 2, heldForWaitlist: false })
  })

  it("comes from the school's config inside BannerClient", async () => {
    const row = { courseReferenceNumber: '30001', subject: 'CS', courseNumber: '1331', sequenceNumber: 'A', seatsAvailable: 3, waitCount: 5 }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/ssb/term/search')) return new Response(JSON.stringify({}), { status: 200 })
      if (url.includes('searchResults/searchResults')) return new Response(JSON.stringify({ data: [row] }), { status: 200 })
      return new Response(null, { status: 200 })
    }))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const school = (holds?: boolean) => ({
      id: 'testschool', name: 'Test', shortName: 'Test', aliases: [],
      banner: { baseUrl: 'https://example.edu/StudentRegistrationSsb', registerSite: 'example.edu', subjectAliases: {}, ...(holds === undefined ? {} : { waitlistHoldsSeats: holds }) },
    })

    const [unset] = await new BannerClient(school()).searchByCourse('202702', 'CS', '1331')
    const [open] = await new BannerClient(school(false)).searchByCourse('202702', 'CS', '1331')
    expect(unset).toMatchObject({ takeableSeats: 0, heldForWaitlist: true })
    expect(open).toMatchObject({ takeableSeats: 3, heldForWaitlist: false })
    vi.unstubAllGlobals()
  })
})
