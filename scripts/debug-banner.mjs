/**
 * scripts/debug-banner.mjs
 * Full flow debug + fixture assertions against live GSU Banner.
 * Run: node scripts/debug-banner.mjs
 */
import { config } from 'dotenv'
config()

// Inline the fixed banner logic to avoid TS compilation
const BASE = 'https://registration.gosolar.gsu.edu/StudentRegistrationSsb'
const UA = 'SeatSnipe/1.0 (nudgebuddy.net) seat-availability-monitor zacharyinyan@gmail.com'

function extractCookies(res) {
  const all = res.headers.getSetCookie?.() ?? []
  if (all.length) return all.map(c => c.split(';')[0]).join('; ')
  const single = res.headers.get('set-cookie') ?? ''
  return single.split(/,\s*(?=[A-Za-z0-9_]+=)/).map(c => c.split(';')[0].trim()).filter(Boolean).join('; ')
}
function mergeCookies(a, b) {
  const map = new Map()
  for (const kv of [...a.split('; '), ...b.split('; ')]) {
    const eq = kv.indexOf('=')
    if (eq > 0) map.set(kv.slice(0, eq), kv)
  }
  return [...map.values()].join('; ')
}

// Step 1: getTerms
process.stdout.write('1. getTerms ... ')
const r0 = await fetch(`${BASE}/ssb/classSearch/getTerms?searchTerm=&offset=1&max=20`, { headers: { 'User-Agent': UA } })
const terms = await r0.json()
const active = terms.find(t => !t.description.includes('View Only'))
const TERM = active.code
console.log(`${TERM} (${active.description})`)

// Step 2: GET /ssb/registration (establishes base session)
process.stdout.write('2. GET /ssb/registration ... ')
const r1 = await fetch(`${BASE}/ssb/registration`, { headers: { 'User-Agent': UA } })
let cookies = extractCookies(r1)
console.log(r1.status, cookies.split(';').map(c => c.split('=')[0].trim()).join(', '))

// Step 3: POST selectTerm
process.stdout.write('3. POST selectTerm ... ')
const r2 = await fetch(`${BASE}/ssb/term/search?mode=search`, {
  method: 'POST',
  headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', cookie: cookies },
  body: new URLSearchParams({ term: TERM, studyPath: '', studyPathText: '', startDatepicker: '', endDatepicker: '' }).toString(),
})
const more2 = extractCookies(r2)
if (more2) cookies = mergeCookies(cookies, more2)
const j2 = await r2.json()
console.log(r2.status, j2.fwdURL)

// Step 4: GET classSearch
process.stdout.write('4. GET classSearch ... ')
const r3 = await fetch(`https://registration.gosolar.gsu.edu${j2.fwdURL}`, {
  headers: { 'User-Agent': UA, cookie: cookies },
})
const more3 = extractCookies(r3)
if (more3) cookies = mergeCookies(cookies, more3)
console.log(r3.status)

async function resetAndSearch(label, params) {
  await fetch(`${BASE}/ssb/classSearch/resetDataForm`, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', cookie: cookies },
    body: '',
  })
  const qs = new URLSearchParams({ pageOffset: '0', pageMaxSize: '500', sortColumn: 'subjectDescription', sortDirection: 'asc', txt_term: TERM, ...params })
  const r = await fetch(`${BASE}/ssb/searchResults/searchResults?${qs}`, {
    headers: { 'User-Agent': UA, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json', cookie: cookies, Referer: `${BASE}/ssb/classSearch/classSearch` },
  })
  const j = await r.json()
  return j
}

// Step 5: search CSC 1301L
console.log('\n5. searchResults CSC 1301L')
const j5 = await resetAndSearch('CSC 1301L', { txt_subject: 'CSC', txt_courseNumber: '1301L' })
console.log(`   totalCount: ${j5.totalCount}  data: ${j5.data?.length}`)
j5.data?.forEach(s => console.log(`   CRN ${s.courseReferenceNumber}: ${s.seatsAvailable}/${s.maximumEnrollment} seats`))

// Step 6: find CRN 90474 in results
const s90474 = j5.data?.find(s => s.courseReferenceNumber === '90474')
const s90476 = j5.data?.find(s => s.courseReferenceNumber === '90476')
console.log('\n6. Fixture assertions')
console.log(`   CRN 90474 seatsAvailable >= 1: ${s90474?.seatsAvailable >= 1 ? 'PASS ✓' : `FAIL ✗ (${s90474?.seatsAvailable})`}`)
console.log(`   CRN 90476 seatsAvailable = 0 : ${s90476?.seatsAvailable === 0 ? 'PASS ✓' : `FAIL ✗ (${s90476?.seatsAvailable})`}`)

// Step 7: simulate second poll (same session, reset + search again)
console.log('\n7. Re-poll same session (simulates watcher loop)')
const j7 = await resetAndSearch('CSC 1301L re-poll', { txt_subject: 'CSC', txt_courseNumber: '1301L' })
const s2_90474 = j7.data?.find(s => s.courseReferenceNumber === '90474')
console.log(`   totalCount: ${j7.totalCount}  CRN 90474: ${s2_90474?.seatsAvailable} seats`)
console.log(`   Consistent with first poll: ${s2_90474?.seatsAvailable === s90474?.seatsAvailable ? 'PASS ✓' : 'FAIL ✗'}`)

console.log('\n=== DONE ===')
