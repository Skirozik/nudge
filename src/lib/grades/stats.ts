import { prisma } from '../prisma'
import { sameInstructor } from './names'

// Three years of history: long enough for a real sample, recent enough to
// still describe how the professor teaches the course.
export const HISTORY_YEARS = 3
// Fewer letter-graded students than this says more about one class than the professor
export const MIN_STUDENTS = 20

export interface GradeRow {
  term: string
  instructor: string
  a: number
  b: number
  c: number
  d: number
  f: number
  w: number
  wf: number
  other: number
  gpa: number | null
}

export interface GradeStats {
  // Average GPA of their letter grades in this course (plus/minus scale)
  avgGpa: number
  // GSU's D/W/F rate: D, F, W and WF over everyone enrolled, Other included
  dfwRate: number
  students: number
  sections: number
  since: string
}

/** "202701" → "202401", the first term counted. */
export function sinceTerm(activeTerm: string): string {
  return `${Number(activeTerm.slice(0, 4)) - HISTORY_YEARS}${activeTerm.slice(4)}`
}

/** "202308" → "Fall 2023" */
export function termLabel(term: string): string {
  const season = { '01': 'Spring', '05': 'Summer', '08': 'Fall' }[term.slice(4)] ?? 'Term'
  return `${season} ${term.slice(0, 4)}`
}

/** One instructor's sections in one course → their stats, or null when there's too little to say. */
export function summarize(rows: GradeRow[]): GradeStats | null {
  let graded = 0
  let gpaWeight = 0
  let gpaSum = 0
  let dfw = 0
  let enrolled = 0
  const sections = rows.filter((r) => {
    const letters = r.a + r.b + r.c + r.d + r.f + r.wf
    if (!letters && !r.w) return false
    graded += letters
    if (r.gpa !== null && letters) {
      gpaSum += r.gpa * letters
      gpaWeight += letters
    }
    dfw += r.d + r.f + r.w + r.wf
    enrolled += letters + r.w + r.other
    return true
  })
  if (graded < MIN_STUDENTS || !gpaWeight) return null
  return {
    avgGpa: Math.round((gpaSum / gpaWeight) * 100) / 100,
    dfwRate: Math.round((dfw / enrolled) * 100) / 100,
    students: graded,
    sections: sections.length,
    since: termLabel(sections.map((r) => r.term).sort()[0]),
  }
}

/**
 * Grade stats for each instructor in a section list, by instructor name. Never
 * throws: grades are extra, and a section list must still go out without them.
 */
export async function gradesByInstructor(
  school: string,
  courseCode: string,
  activeTerm: string,
  instructors: Array<string | null>
): Promise<Map<string, GradeStats>> {
  const out = new Map<string, GradeStats>()
  const names = [...new Set(instructors.filter((n): n is string => !!n))]
  if (!names.length) return out
  try {
    const rows = await prisma.gradeSection.findMany({
      where: { school, courseCode, term: { gte: sinceTerm(activeTerm), lt: activeTerm } },
      select: { term: true, instructor: true, a: true, b: true, c: true, d: true, f: true, w: true, wf: true, other: true, gpa: true },
    })
    for (const name of names) {
      const stats = summarize(rows.filter((r) => sameInstructor(name, r.instructor)))
      if (stats) out.set(name, stats)
    }
  } catch (err) {
    console.error(`[grades] lookup failed for ${school} ${courseCode}:`, err instanceof Error ? err.message : String(err))
  }
  return out
}
