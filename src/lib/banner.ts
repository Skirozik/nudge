/**
 * GSU Banner/Ellucian API client for SeatSnipe.
 *
 * Key findings from live testing against registration.gosolar.gsu.edu:
 * - Term list must be fetched from getTerms API (not computed from month).
 * - Session requires: GET /ssb/registration → POST selectTerm → GET classSearch.
 * - searchResults must be called via GET (query params), not POST — POST silently
 *   ignores filter params on GSU's Banner instance.
 * - txt_courseReferenceNumber filter is broken on GSU's instance — it ignores the
 *   CRN and returns all sections. Always search by subject+courseNumber instead,
 *   then find the target CRN in the result set.
 * - resetDataForm must be called before each search in a reused session.
 */

const BASE = 'https://registration.gosolar.gsu.edu/StudentRegistrationSsb'
const CLASS_SEARCH_URL = `${BASE}/ssb/classSearch/classSearch`

const UA = 'SeatSnipe/1.0 (nudgebuddy.net) seat-availability-monitor zacharyinyan@gmail.com'

// Common student abbreviations → GSU subject codes
const SUBJECT_MAP: Record<string, string> = {
  CSCI: 'CSC',
  CS: 'CSC',
  ECO: 'ECON',
  ECONOMICS: 'ECON',
  BIO: 'BIOL',
  BIOLOGY: 'BIOL',
  CHEM: 'CHEM',
  MATH: 'MATH',
  PHYS: 'PHYS',
  PHYSICS: 'PHYS',
  PSYCH: 'PSYC',
  PSYCHOLOGY: 'PSYC',
  COMM: 'SCOM',
  COMMUNICATIONS: 'SCOM',
}

function normalizeSubject(s: string): string {
  const up = s.toUpperCase()
  return SUBJECT_MAP[up] ?? up
}

// ── Module-level session state (persistent worker process) ────────────────────
let sessionCookies = ''
let sessionTerm = ''
let cachedActiveTerm: string | null = null
let cachedActiveTermAt = 0
const TERM_CACHE_MS = 6 * 60 * 60 * 1000 // re-check every 6h — a forever-cache serves the old term once the next registration period opens
let lastRequestAt = 0
const RATE_MS = 500

// Serialize all Banner searches: the session state (cookies, selected term,
// resetDataForm) is shared module state, and the rate limiter's read-then-set
// isn't atomic — concurrent pollers would thrash sessions and burst requests.
let searchChain: Promise<unknown> = Promise.resolve()
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = searchChain.then(fn, fn)
  searchChain = run.catch(() => {})
  return run
}

async function rateLimit(): Promise<void> {
  const wait = RATE_MS - (Date.now() - lastRequestAt)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt = Date.now()
}

function extractCookies(res: Response): string {
  const h = res.headers as Headers & { getSetCookie?(): string[] }
  const all = h.getSetCookie?.() ?? []
  if (all.length) return all.map((c) => c.split(';')[0]).join('; ')
  const single = res.headers.get('set-cookie') ?? ''
  return single
    .split(/,\s*(?=[A-Za-z0-9_]+=)/)
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ')
}

function mergeCookies(a: string, b: string): string {
  const map = new Map<string, string>()
  for (const kv of [...a.split('; '), ...b.split('; ')]) {
    const eq = kv.indexOf('=')
    if (eq > 0) map.set(kv.slice(0, eq), kv)
  }
  return [...map.values()].join('; ')
}

// ── Term discovery ────────────────────────────────────────────────────────────

/** Fetch active term from Banner's term list — first entry without "(View Only)". */
export async function getActiveTerm(): Promise<string> {
  if (cachedActiveTerm && Date.now() - cachedActiveTermAt < TERM_CACHE_MS) return cachedActiveTerm
  try {
    await rateLimit()
    const res = await fetch(`${BASE}/ssb/classSearch/getTerms?searchTerm=&offset=1&max=20`, {
      headers: { 'User-Agent': UA },
    })
    const terms = (await res.json()) as Array<{ code: string; description: string }>
    const active = terms.find((t) => !t.description.includes('View Only'))
    if (!active) throw new Error('[banner] no active term found in getTerms')
    if (cachedActiveTerm && cachedActiveTerm !== active.code) {
      console.log(`[banner] active term changed: ${cachedActiveTerm} → ${active.code}`)
    }
    cachedActiveTerm = active.code
    cachedActiveTermAt = Date.now()
    console.log(`[banner] active term: ${active.code} (${active.description})`)
    return active.code
  } catch (err) {
    // Refresh failed — fall back to the stale value if we have one
    if (cachedActiveTerm) return cachedActiveTerm
    throw err
  }
}

// ── Session management ────────────────────────────────────────────────────────

async function selectTerm(term: string): Promise<void> {
  // 1. Initial GET to establish base JSESSIONID + BIGip cookies
  await rateLimit()
  const r0 = await fetch(`${BASE}/ssb/registration`, { headers: { 'User-Agent': UA } })
  let cookies = extractCookies(r0)

  // 2. POST term selection
  await rateLimit()
  const r1 = await fetch(`${BASE}/ssb/term/search?mode=search`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      cookie: cookies,
    },
    body: new URLSearchParams({
      term,
      studyPath: '',
      studyPathText: '',
      startDatepicker: '',
      endDatepicker: '',
    }).toString(),
  })
  if (!r1.ok) throw new Error(`[banner] term selection failed: ${r1.status}`)
  const more1 = extractCookies(r1)
  if (more1) cookies = mergeCookies(cookies, more1)
  const j1 = (await r1.json()) as { fwdURL?: string }

  // 3. GET classSearch page — required before searchResults returns data
  const fwd = j1.fwdURL ?? '/StudentRegistrationSsb/ssb/classSearch/classSearch'
  await rateLimit()
  const r2 = await fetch(`https://registration.gosolar.gsu.edu${fwd}`, {
    headers: { 'User-Agent': UA, cookie: cookies },
  })
  const more2 = extractCookies(r2)
  if (more2) cookies = mergeCookies(cookies, more2)

  sessionCookies = cookies
  sessionTerm = term
  console.log(`[banner] session established for term ${term}`)
}

async function resetDataForm(): Promise<void> {
  await fetch(`${BASE}/ssb/classSearch/resetDataForm`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      cookie: sessionCookies,
    },
    body: '',
  })
}

// ── Core search (GET — POST silently ignores filter params on GSU's instance) ─

function doSearch(params: Record<string, string>): Promise<RawSection[]> {
  return serialize(() => doSearchInner(params))
}

async function doSearchInner(
  params: Record<string, string>,
  retried = false
): Promise<RawSection[]> {
  const term = params.txt_term
  if (!sessionCookies || sessionTerm !== term) await selectTerm(term)

  await resetDataForm()
  await rateLimit()

  const qs = new URLSearchParams({
    pageOffset: '0',
    pageMaxSize: '500',
    sortColumn: 'subjectDescription',
    sortDirection: 'asc',
    ...params,
  })

  const res = await fetch(`${BASE}/ssb/searchResults/searchResults?${qs}`, {
    headers: {
      'User-Agent': UA,
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json',
      cookie: sessionCookies,
      Referer: CLASS_SEARCH_URL,
    },
  })

  if ((res.status === 401 || res.status === 403) && !retried) {
    sessionCookies = ''
    await selectTerm(term)
    return doSearchInner(params, true)
  }

  if (!res.ok) throw new Error(`[banner] searchResults ${res.status}`)

  // Stale sessions usually 302 → fetch follows → 200 with an HTML login page.
  // Without this, the dead session is reused forever and every poll fails silently.
  const text = await res.text()
  let json: { data?: RawSection[] }
  try {
    json = JSON.parse(text) as { data?: RawSection[] }
  } catch {
    if (!retried) {
      console.log('[banner] non-JSON response (session expired?) — re-establishing session')
      sessionCookies = ''
      await selectTerm(term)
      return doSearchInner(params, true)
    }
    throw new Error(`[banner] searchResults returned non-JSON after re-login (first 120 chars): ${text.slice(0, 120)}`)
  }
  return json.data ?? []
}

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Poll a single CRN by searching its course and finding the matching entry.
 * courseCode is required because GSU's Banner ignores the txt_courseReferenceNumber
 * filter — we must search by subject+courseNumber and filter client-side.
 */
export async function searchByCrn(
  term: string,
  crn: string,
  courseCode: string
): Promise<SectionInfo | null> {
  try {
    const parts = courseCode.trim().split(/\s+/)
    if (parts.length < 2) throw new Error(`[banner] invalid courseCode: ${courseCode}`)
    const subject = normalizeSubject(parts[0])
    const courseNumber = parts[1].toUpperCase()
    const rows = await doSearch({ txt_term: term, txt_subject: subject, txt_courseNumber: courseNumber })
    const match = rows.find((r) => r.courseReferenceNumber === crn)
    return match ? parse(match) : null
  } catch (err) {
    console.error(`[banner] searchByCrn(${crn}):`, err)
    return null
  }
}

/** Fetch all sections for a course code. Subject is normalized (CSCI → CSC). */
export async function searchByCourse(
  term: string,
  subject: string,
  courseNumber: string
): Promise<SectionInfo[]> {
  try {
    const normalizedSubject = normalizeSubject(subject)
    const rows = await doSearch({
      txt_term: term,
      txt_subject: normalizedSubject,
      txt_courseNumber: courseNumber.toUpperCase(),
    })
    return rows.map(parse)
  } catch (err) {
    console.error(`[banner] searchByCourse(${subject} ${courseNumber}):`, err)
    return []
  }
}

/** Active term from Banner API (cached). Replaces computed getCurrentTerm(). */
export async function getCurrentTerm(): Promise<string> {
  return getActiveTerm()
}
