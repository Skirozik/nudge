import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { readGradeFile, type FileRow } from '../src/lib/grades/gradeFile'
import { sameInstructor } from '../src/lib/grades/names'
import { termLabel } from '../src/lib/grades/stats'

/**
 * Loads one term of a school's grade distribution export into GradeSection.
 *
 *   npx tsx scripts/load-grades.ts <file.csv> --term 202601            dry run: parse and check
 *   npx tsx scripts/load-grades.ts <file.csv> --term 202601 --verify 60  also ask Banner who taught
 *                                                                        60 sampled sections that term
 *   npx tsx scripts/load-grades.ts <file.csv> --term 202601 --apply      replace that term's rows
 *
 * --verify is the trust check: a wrong name match puts another professor's
 * grades in a student's text, so load nothing until it comes back near 100%.
 * Dry run and --verify never touch the database.
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}

function dfwPct(r: FileRow): number | null {
  const all = r.a + r.b + r.c + r.d + r.f + r.w + r.wf
  return all ? ((r.d + r.f + r.w + r.wf) / all) * 100 : null
}

/** Our D/F/W math against the file's own column, so a wrong definition shows up before loading. */
function checkDfw(rows: FileRow[]): void {
  const withPct = rows.filter((r) => r.filePctDfw !== null && dfwPct(r) !== null)
  if (!withPct.length) return console.log('D/W/F check: the file has no D/W/F column values to compare.')
  // Some exports write 12.5, some 0.125
  const scale = withPct.every((r) => r.filePctDfw! <= 1) ? 100 : 1
  const off = withPct.filter((r) => Math.abs(r.filePctDfw! * scale - dfwPct(r)!) > 0.6)
  console.log(`D/W/F check: ${withPct.length - off.length}/${withPct.length} sections agree with the file's own percent.`)
  for (const r of off.slice(0, 5)) {
    console.log(`  CRN ${r.crn} ${r.courseCode}: file ${(r.filePctDfw! * scale).toFixed(1)}%, ours ${dfwPct(r)!.toFixed(1)}%`)
  }
}

async function verify(rows: FileRow[], term: string, school: string, n: number): Promise<void> {
  const { bannerFor } = await import('../src/lib/banner')
  const step = Math.max(1, Math.floor(rows.length / n))
  const sample = rows.filter((_, i) => i % step === 0).slice(0, n)
  const byCourse = new Map<string, FileRow[]>()
  for (const r of sample) byCourse.set(r.courseCode, [...(byCourse.get(r.courseCode) ?? []), r])

  let match = 0
  let miss = 0
  let notFound = 0
  const banner = bannerFor(school)
  console.log(`\nVerify: asking Banner about ${sample.length} sections in ${byCourse.size} courses (${termLabel(term)})...`)
  for (const [course, list] of byCourse) {
    const [subject, number] = course.split(' ')
    const sections = await banner.searchByCourse(term, subject, number)
    for (const r of list) {
      const s = sections.find((x) => x.crn === r.crn)
      if (!s) {
        notFound++
        console.log(`  ? CRN ${r.crn} ${course}: not in Banner's ${termLabel(term)} results`)
      } else if (sameInstructor(s.instructor, r.instructor)) match++
      else {
        miss++
        console.log(`  ✗ CRN ${r.crn} ${course}: file "${r.instructor}", Banner "${s.instructor ?? 'Staff'}"`)
      }
    }
  }
  const checked = match + miss
  console.log(`Verify: ${match}/${checked} matched${checked ? ` (${((match / checked) * 100).toFixed(1)}%)` : ''}, ${notFound} not found in Banner.`)
}

async function main() {
  const file = process.argv[2]
  const term = arg('--term') ?? ''
  const school = arg('--school') ?? 'gsu'
  const verifyN = arg('--verify')
  if (!file || file.startsWith('--')) throw new Error('Usage: load-grades.ts <file.csv> --term 202601 [--verify 60] [--apply]')
  if (!/^\d{4}(01|05|08)$/.test(term)) throw new Error(`--term must be a Banner term code like 202601, got "${term}"`)

  const { rows, skipped } = readGradeFile(readFileSync(file, 'utf8'))
  console.log(`${termLabel(term)} at ${school}: ${rows.length} sections read, ${skipped.length} skipped.`)
  const reasons = new Map<string, number>()
  for (const s of skipped) {
    const key = s.why.replace(/\(.*\)$/, '').trim()
    reasons.set(key, (reasons.get(key) ?? 0) + 1)
  }
  for (const [why, n] of reasons) console.log(`  skipped ${n}: ${why} (e.g. line ${skipped.find((s) => s.why.startsWith(why))!.line})`)
  console.log(`  ${new Set(rows.map((r) => r.courseCode)).size} courses, ${new Set(rows.map((r) => r.instructor)).size} instructors`)
  const badGpa = rows.filter((r) => r.gpa !== null && (r.gpa < 0 || r.gpa > 4.34))
  if (badGpa.length) console.log(`  ${badGpa.length} sections have a course average outside 0–4.33, e.g. CRN ${badGpa[0].crn}: ${badGpa[0].gpa}`)
  console.log('  first rows:')
  for (const r of rows.slice(0, 3)) console.log(`    ${JSON.stringify(r)}`)
  checkDfw(rows)

  if (verifyN) await verify(rows, term, school, Number(verifyN))

  if (!process.argv.includes('--apply')) {
    console.log('\nDry run. Nothing written. Add --apply to replace this term in the database.')
    return
  }
  const { prisma } = await import('../src/lib/prisma')
  const [deleted, created] = await prisma.$transaction([
    prisma.gradeSection.deleteMany({ where: { school, term } }),
    prisma.gradeSection.createMany({
      data: rows.map(({ filePctDfw: _pct, ...r }) => ({ ...r, school, term })),
      skipDuplicates: true,
    }),
  ])
  console.log(`\nReplaced ${termLabel(term)}: removed ${deleted.count} old rows, wrote ${created.count}.`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
