/**
 * GSU Banner/Ellucian API client for SeatSnipe.
 *
 * Key design: Banner requires a term-selection POST before any search results
 * endpoint will respond with data. That POST sets session cookies. This module
 * maintains a module-level cookie string so the worker (persistent process) only
 * re-authenticates when the term changes or the session expires.
 *
 * Seat counts come from `searchResults` (not `getSectionDetail` or
 * `getFacultyMeetingTimes` — those don't carry seatsAvailable).
 */

const BASE = 'https://registration.gosolar.gsu.edu/StudentRegistrationSsb'

const SHARED_HEADERS: Record<string, string> = {
  'User-Agent': 'SeatSnipe/1.0 (nudgebuddy.net) seat-availability-monitor zacharyinyan@gmail.com',
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'X-Requested-With': 'XMLHttpRequest',
}

let sessionCookies = ''
let sessionTerm = ''
let lastRequestAt = 0
const RATE_MS = 500

async function rateLimit(): Promise<void> {
  const wait = RATE_MS - (Date.now() - lastRequestAt)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt = Date.now()
}

async function selectTerm(term: string): Promise<void> {
  await rateLimit()
  const body = new URLSearchParams({
    term,
    studyPath: '',
    studyPathText: '',
    startDatepicker: '',
    endDatepicker: '',
  })
  const res = await fetch(`${BASE}/ssb/term/search?mode=search`, {
    method: 'POST',
    headers: SHARED_HEADERS,
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`[banner] term selection failed: ${res.status}`)

  // Extract session cookies — getSetCookie() is available in Node 18.14+ (Next.js 15 requires 18.17+)
  const h = res.headers as Headers & { getSetCookie?(): string[] }
  const cookies = h.getSetCookie?.() ?? []
  if (cookies.length) {
    sessionCookies = cookies.map((c) => c.split(';')[0]).join('; ')
  } else {
    // Fallback: single set-cookie header (rare)
    const single = res.headers.get('set-cookie')
    if (single) sessionCookies = single.split(';')[0]
  }
  sessionTerm = term
}

async function doSearch(params: Record<string, string>, retried = false): Promise<RawSection[]> {
  const term = params.txt_term
  if (!sessionCookies || sessionTerm !== term) await selectTerm(term)

  await rateLimit()
  const body = new URLSearchParams({
    pageOffset: '0',
    pageMaxSize: '50',
    sortColumn: 'subjectDescription',
    sortDirection: 'asc',
    ...params,
  })

  const res = await fetch(`${BASE}/ssb/searchResults/searchResults`, {
    method: 'POST',
    headers: { ...SHARED_HEADERS, cookie: sessionCookies },
    body: body.toString(),
  })

  if ((res.status === 401 || res.status === 403) && !retried) {
    // Session expired — re-auth once
    sessionCookies = ''
    await selectTerm(term)
    return doSearch(params, true)
  }

  if (!res.ok) throw new Error(`[banner] searchResults ${res.status}`)

  const json = (await res.json()) as { data?: RawSection[] }
  return json.data ?? []
}

interface RawSection {
  courseReferenceNumber?: string
  subject?: string
  courseNumber?: string
  sequenceNumber?: string
  seatsAvailable?: number
  maximumEnrollment?: number
  faculty?: Array<{ displayName?: string }>
  meetingsFaculty?: Array<{
    meetingTime?: {
      beginTime?: string
      endTime?: string
      monday?: boolean
      tuesday?: boolean
      wednesday?: boolean
      thursday?: boolean
      friday?: boolean
    }
  }>
}

export interface SectionInfo {
  crn: string
  courseCode: string
  sectionLabel: string
  seatsAvailable: number
  maximumEnrollment: number
}

function parse(raw: RawSection): SectionInfo {
  const subject = raw.subject ?? ''
  const number = raw.courseNumber ?? ''
  const seq = raw.sequenceNumber ?? ''
  const crn = raw.courseReferenceNumber ?? ''

  const instructor = raw.faculty?.[0]?.displayName ?? 'Staff'
  const mt = raw.meetingsFaculty?.[0]?.meetingTime
  let days = ''
  let time = 'TBA'
  if (mt) {
    const d: string[] = []
    if (mt.monday) d.push('M')
    if (mt.tuesday) d.push('T')
    if (mt.wednesday) d.push('W')
    if (mt.thursday) d.push('Th')
    if (mt.friday) d.push('F')
    days = d.join('')
    if (mt.beginTime && mt.endTime) time = `${mt.beginTime}–${mt.endTime}`
  }

  return {
    crn,
    courseCode: `${subject} ${number}`,
    sectionLabel: `Sec ${seq}${days ? `, ${days}` : ''} ${time}, ${instructor}`.trim(),
    seatsAvailable: raw.seatsAvailable ?? 0,
    maximumEnrollment: raw.maximumEnrollment ?? 0,
  }
}

/** Poll a single CRN. Returns null on API error (caller handles circuit breaker). */
export async function searchByCrn(term: string, crn: string): Promise<SectionInfo | null> {
  try {
    const rows = await doSearch({ txt_term: term, txt_courseReferenceNumber: crn, pageMaxSize: '1' })
    if (!rows.length) return null
    return parse(rows[0])
  } catch (err) {
    console.error(`[banner] searchByCrn(${crn}):`, err)
    return null
  }
}

/** Fetch all sections for a specific course code (subject + number). */
export async function searchByCourse(
  term: string,
  subject: string,
  courseNumber: string
): Promise<SectionInfo[]> {
  try {
    const rows = await doSearch({ txt_term: term, txt_subject: subject, txt_courseNumber: courseNumber })
    return rows.map(parse)
  } catch (err) {
    console.error(`[banner] searchByCourse(${subject} ${courseNumber}):`, err)
    return []
  }
}

/** Current GSU term code (YYYYMM). */
export function getCurrentTerm(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  if (month <= 5) return `${year}01`
  if (month <= 7) return `${year}05`
  return `${year}08`
}
