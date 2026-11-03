/**
 * Reads a grade distribution CSV exported from GSU's grade portal
 * (dssapex.gsu.edu): one row per section, letter-grade counts, the course
 * average and the D/W/F percent. Headers are matched loosely ("A  (90-100)",
 * "F <60", "Other ") because the export's spacing isn't stable.
 */

import { normalizeCourse, parseName } from './names'

export interface FileRow {
  crn: string
  courseCode: string
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
  // The file's own D/W/F percent and Total, kept only to check our math against
  filePctDfw: number | null
  fileTotal: number | null
}

export interface ParseResult {
  rows: FileRow[]
  skipped: Array<{ line: number; why: string }>
}

/** RFC 4180: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      if (row.some((f) => f.trim())) out.push(row)
      row = []
      field = ''
    } else field += ch
  }
  row.push(field)
  if (row.some((f) => f.trim())) out.push(row)
  return out
}

const COLUMNS = {
  crn: /^CRN$/,
  course: /^COURSE$/,
  instructor: /^(PROFESSOR|INSTRUCTOR)$/,
  a: /^A(\s*\(|$)/,
  b: /^B(\s*\(|$)/,
  c: /^C(\s*\(|$)/,
  d: /^D(\s*\(|$)/,
  f: /^F(\s*[(<]|$)/,
  w: /^W$/,
  wf: /^WF$/,
  other: /^OTHER$/,
  gpa: /^CRS\s*AVG$/,
  dwf: /^DWF$/,
  total: /^TOTAL$/,
} as const

type Column = keyof typeof COLUMNS
const REQUIRED: Column[] = ['crn', 'course', 'instructor', 'a', 'b', 'c', 'd', 'f', 'w', 'wf', 'other', 'gpa']

/** Header name → column index. Throws naming what's missing, with the headers it did see. */
export function mapHeaders(headers: string[]): Partial<Record<Column, number>> {
  const map: Partial<Record<Column, number>> = {}
  headers.forEach((h, i) => {
    const name = h.trim().toUpperCase()
    for (const [col, re] of Object.entries(COLUMNS) as Array<[Column, RegExp]>) {
      if (map[col] === undefined && re.test(name)) map[col] = i
    }
  })
  const missing = REQUIRED.filter((c) => map[c] === undefined)
  if (missing.length) {
    throw new Error(`Missing columns: ${missing.join(', ')}. Headers found: ${headers.map((h) => JSON.stringify(h)).join(', ')}`)
  }
  return map
}

function count(raw: string | undefined): number | null {
  const s = (raw ?? '').trim()
  if (!s) return 0
  return /^\d+$/.test(s) ? Number(s) : null
}

function decimal(raw: string | undefined): number | null {
  const s = (raw ?? '').replace('%', '').trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function readGradeFile(text: string): ParseResult {
  const [headers, ...body] = parseCsv(text)
  if (!headers) throw new Error('Empty file')
  const col = mapHeaders(headers)
  const rows: FileRow[] = []
  const skipped: ParseResult['skipped'] = []
  body.forEach((cells, i) => {
    const line = i + 2
    const at = (c: Column) => (col[c] === undefined ? undefined : cells[col[c]!])
    const crn = (at('crn') ?? '').trim()
    const instructor = (at('instructor') ?? '').replace(/\s+/g, ' ').trim()
    if (!/^\d+$/.test(crn)) return skipped.push({ line, why: `no CRN (${JSON.stringify(crn)})` })
    if (!parseName(instructor)) return skipped.push({ line, why: `instructor not "Last, First" (${JSON.stringify(instructor)})` })
    const counts = (['a', 'b', 'c', 'd', 'f', 'w', 'wf', 'other'] as const).map((c) => count(at(c)))
    if (counts.some((n) => n === null)) return skipped.push({ line, why: 'a grade count isn\'t a whole number' })
    const [a, b, c, d, f, w, wf, other] = counts as number[]
    rows.push({
      crn,
      courseCode: normalizeCourse(at('course') ?? ''),
      instructor,
      a, b, c, d, f, w, wf, other,
      gpa: decimal(at('gpa')),
      filePctDfw: decimal(at('dwf')),
      fileTotal: count(at('total')),
    })
  })
  return { rows, skipped }
}
