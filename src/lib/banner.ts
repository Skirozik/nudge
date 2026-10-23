/**
 * Ellucian Banner 9 client for SeatSnipe, one instance per school.
 *
 * Key findings from live testing against GSU (registration.gosolar.gsu.edu):
 * - Term list must be fetched from getTerms API (not computed from month).
 * - Session requires: GET /ssb/registration → POST selectTerm → GET classSearch.
 * - searchResults must be called via GET (query params), not POST — POST silently
 *   ignores filter params on GSU's Banner instance.
 * - txt_courseReferenceNumber filter is broken on GSU's instance — it ignores the
 *   CRN and returns all sections. Always search by subject+courseNumber instead,
 *   then find the target CRN in the result set.
 * - resetDataForm must be called before each search in a reused session.
 * Other Banner 9 schools may differ; record what you find in their school file.
 */

import { getLiveSchool, type LiveSchool } from './schools'

const UA = 'SeatSnipe/1.0 (nudgebuddy.net) seat-availability-monitor zacharyinyan@gmail.com'

const TERM_CACHE_MS = 6 * 60 * 60 * 1000 // re-check every 6h — a forever-cache serves the old term once the next registration period opens
const RATE_MS = 500

export function normalizeSubject(subject: string, aliases: Record<string, string>): string {
  const up = subject.toUpperCase()
  return aliases[up] ?? up
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
    // Banner reports negative values for over-enrolled sections; clamp so they
    // read as "full" rather than poisoning the 0→N edge detection.
    seatsAvailable: Math.max(0, raw.seatsAvailable ?? 0),
    maximumEnrollment: raw.maximumEnrollment ?? 0,
  }
}

// ── Client ────────────────────────────────────────────────────────────────────

export class BannerClient {
  private readonly base: string
  private readonly origin: string
  private readonly tag: string

  // Session state lives on the instance so each school keeps its own login
  private sessionCookies = ''
  private sessionTerm = ''
  private cachedActiveTerm: string | null = null
  private cachedActiveTermAt = 0
  private lastRequestAt = 0

  // Serialize this school's searches: the session state (cookies, selected term,
  // resetDataForm) is shared, and the rate limiter's read-then-set isn't atomic —
  // concurrent pollers would thrash the session and burst requests.
  private searchChain: Promise<unknown> = Promise.resolve()

  constructor(readonly school: LiveSchool) {
    this.base = school.banner.baseUrl.replace(/\/+$/, '')
    this.origin = new URL(this.base).origin
    this.tag = `[banner:${school.id}]`
  }

  normalizeSubject(subject: string): string {
    return normalizeSubject(subject, this.school.banner.subjectAliases)
  }

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.searchChain.then(fn, fn)
    this.searchChain = run.catch(() => {})
    return run
  }

  private async rateLimit(): Promise<void> {
    const wait = RATE_MS - (Date.now() - this.lastRequestAt)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    this.lastRequestAt = Date.now()
  }

  // ── Term discovery ──────────────────────────────────────────────────────────

  /** Fetch active term from Banner's term list — first entry without "(View Only)". */
  async getActiveTerm(): Promise<string> {
    if (this.cachedActiveTerm && Date.now() - this.cachedActiveTermAt < TERM_CACHE_MS) return this.cachedActiveTerm
    try {
      await this.rateLimit()
      const res = await fetch(`${this.base}/ssb/classSearch/getTerms?searchTerm=&offset=1&max=20`, {
        headers: { 'User-Agent': UA },
      })
      const terms = (await res.json()) as Array<{ code: string; description: string }>
      const active = terms.find((t) => !t.description.includes('View Only'))
      if (!active) throw new Error(`${this.tag} no active term found in getTerms`)
      if (this.cachedActiveTerm && this.cachedActiveTerm !== active.code) {
        console.log(`${this.tag} active term changed: ${this.cachedActiveTerm} → ${active.code}`)
      }
      this.cachedActiveTerm = active.code
      this.cachedActiveTermAt = Date.now()
      console.log(`${this.tag} active term: ${active.code} (${active.description})`)
      return active.code
    } catch (err) {
      // Refresh failed — fall back to the stale value if we have one
      if (this.cachedActiveTerm) return this.cachedActiveTerm
      throw err
    }
  }

  // ── Session management ──────────────────────────────────────────────────────

  private async selectTerm(term: string): Promise<void> {
    // 1. Initial GET to establish base JSESSIONID + BIGip cookies
    await this.rateLimit()
    const r0 = await fetch(`${this.base}/ssb/registration`, { headers: { 'User-Agent': UA } })
    let cookies = extractCookies(r0)

    // 2. POST term selection
    await this.rateLimit()
    const r1 = await fetch(`${this.base}/ssb/term/search?mode=search`, {
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
    if (!r1.ok) throw new Error(`${this.tag} term selection failed: ${r1.status}`)
    const more1 = extractCookies(r1)
    if (more1) cookies = mergeCookies(cookies, more1)
    const j1 = (await r1.json()) as { fwdURL?: string }

    // 3. GET classSearch page — required before searchResults returns data
    const fwd = j1.fwdURL ?? new URL(`${this.base}/ssb/classSearch/classSearch`).pathname
    await this.rateLimit()
    const r2 = await fetch(`${this.origin}${fwd}`, {
      headers: { 'User-Agent': UA, cookie: cookies },
    })
    const more2 = extractCookies(r2)
    if (more2) cookies = mergeCookies(cookies, more2)

    this.sessionCookies = cookies
    this.sessionTerm = term
    console.log(`${this.tag} session established for term ${term}`)
  }

  private async resetDataForm(): Promise<void> {
    await fetch(`${this.base}/ssb/classSearch/resetDataForm`, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        cookie: this.sessionCookies,
      },
      body: '',
    })
  }

  // ── Core search (GET — POST silently ignores filter params on GSU's instance) ─

  private doSearch(params: Record<string, string>): Promise<RawSection[]> {
    return this.serialize(() => this.doSearchInner(params))
  }

  private async doSearchInner(params: Record<string, string>, retried = false): Promise<RawSection[]> {
    const term = params.txt_term
    if (!this.sessionCookies || this.sessionTerm !== term) await this.selectTerm(term)

    await this.resetDataForm()
    await this.rateLimit()

    const qs = new URLSearchParams({
      pageOffset: '0',
      pageMaxSize: '500',
      sortColumn: 'subjectDescription',
      sortDirection: 'asc',
      ...params,
    })

    const res = await fetch(`${this.base}/ssb/searchResults/searchResults?${qs}`, {
      headers: {
        'User-Agent': UA,
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
        cookie: this.sessionCookies,
        Referer: `${this.base}/ssb/classSearch/classSearch`,
      },
    })

    if ((res.status === 401 || res.status === 403) && !retried) {
      this.sessionCookies = ''
      await this.selectTerm(term)
      return this.doSearchInner(params, true)
    }

    if (!res.ok) throw new Error(`${this.tag} searchResults ${res.status}`)

    // Stale sessions usually 302 → fetch follows → 200 with an HTML login page.
    // Without this, the dead session is reused forever and every poll fails silently.
    const text = await res.text()
    let json: { data?: RawSection[] }
    try {
      json = JSON.parse(text) as { data?: RawSection[] }
    } catch {
      if (!retried) {
        console.log(`${this.tag} non-JSON response (session expired?) — re-establishing session`)
        this.sessionCookies = ''
        await this.selectTerm(term)
        return this.doSearchInner(params, true)
      }
      throw new Error(`${this.tag} searchResults returned non-JSON after re-login (first 120 chars): ${text.slice(0, 120)}`)
    }
    return json.data ?? []
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Poll a single CRN by searching its course and finding the matching entry.
   * courseCode is required because GSU's Banner ignores the txt_courseReferenceNumber
   * filter — we must search by subject+courseNumber and filter client-side.
   */
  async searchByCrn(term: string, crn: string, courseCode: string): Promise<SectionInfo | null> {
    try {
      const parts = courseCode.trim().split(/\s+/)
      if (parts.length < 2) throw new Error(`${this.tag} invalid courseCode: ${courseCode}`)
      const subject = this.normalizeSubject(parts[0])
      const courseNumber = parts[1].toUpperCase()
      const rows = await this.doSearch({ txt_term: term, txt_subject: subject, txt_courseNumber: courseNumber })
      const match = rows.find((r) => r.courseReferenceNumber === crn)
      return match ? parse(match) : null
    } catch (err) {
      console.error(`${this.tag} searchByCrn(${crn}):`, err)
      return null
    }
  }

  /** Fetch all sections for a course code. Subject is normalized (CSCI → CSC at GSU). */
  async searchByCourse(term: string, subject: string, courseNumber: string): Promise<SectionInfo[]> {
    try {
      const rows = await this.doSearch({
        txt_term: term,
        txt_subject: this.normalizeSubject(subject),
        txt_courseNumber: courseNumber.toUpperCase(),
      })
      return rows.map(parse)
    } catch (err) {
      console.error(`${this.tag} searchByCourse(${subject} ${courseNumber}):`, err)
      return []
    }
  }
}

// One client per school for the life of the process, so sessions are reused.
const clients = new Map<string, BannerClient>()

export function bannerFor(schoolId: string): BannerClient {
  const existing = clients.get(schoolId)
  if (existing) return existing
  const school = getLiveSchool(schoolId)
  if (!school) {
    throw new Error(`[banner] "${schoolId}" isn't live: it needs a banner config and a spot in ENABLED_SCHOOLS`)
  }
  const client = new BannerClient(school)
  clients.set(schoolId, client)
  return client
}
