/**
 * Matching an instructor across Banner and a school's grade file.
 *
 * Banner writes "Last, First (Preferred) M." with stray spaces and periods
 * ("Rusodimos, Iason  ."), and last names can be two words ("Benitez Ulloa").
 * A wrong match puts another professor's grades in a student's text, so a key
 * is only made when the name parses cleanly; anything odd gets no key.
 */

export interface ParsedName {
  last: string
  first: string
  preferred: string | null
}

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z' -]/g, ' ')
    .replace(/['-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "Last, First (Preferred) M." → parts, folded to lowercase ASCII. Null if it isn't that shape. */
export function parseName(raw: string | null | undefined): ParsedName | null {
  if (!raw) return null
  const comma = raw.indexOf(',')
  if (comma < 0) return null
  const last = fold(raw.slice(0, comma))
  let rest = raw.slice(comma + 1)
  const paren = rest.match(/\(([^)]*)\)/)
  const preferred = paren ? fold(paren[1]).split(' ')[0] || null : null
  rest = rest.replace(/\([^)]*\)/g, ' ')
  const first = fold(rest).split(' ')[0] ?? ''
  if (!last || !first) return null
  return { last, first, preferred: preferred && preferred !== first ? preferred : null }
}

/**
 * Same person? Last names must match exactly. When both sides spell out a first
 * name it must match too (legal or preferred, either way round); an initial
 * only has to match the other side's first letter.
 */
export function sameInstructor(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = parseName(a)
  const y = parseName(b)
  if (!x || !y || x.last !== y.last) return false
  const xs = [x.first, x.preferred].filter((n): n is string => !!n)
  const ys = [y.first, y.preferred].filter((n): n is string => !!n)
  if (x.first.length === 1 || y.first.length === 1) return x.first[0] === y.first[0]
  return xs.some((n) => ys.includes(n))
}

/** "MATH2212", "math 2212" → "MATH 2212" */
export function normalizeCourse(raw: string): string {
  const s = raw.toUpperCase().replace(/\s+/g, '')
  const m = s.match(/^([A-Z]+)(\d.*)$/)
  return m ? `${m[1]} ${m[2]}` : raw.trim().toUpperCase()
}
