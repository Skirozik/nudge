import { describe, it, expect } from 'vitest'
import { parseCsv, mapHeaders, readGradeFile } from './gradeFile'

// Headers as GSU's portal exports them, spacing included
const HEADERS = 'CRN,Course,Professor,"A  (90-100)","B  (80-89)","C  (70-79)","D  (60-69)",F <60,WF,A- WF,DWF,W,CRS AVG,Other ,Total,Instruction Method'

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, commas inside quotes and CRLF', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ])
  })

  it('drops a byte-order mark and blank lines', () => {
    expect(parseCsv('﻿x,y\n\n1,2')).toEqual([['x', 'y'], ['1', '2']])
  })
})

describe('mapHeaders', () => {
  it('finds every column in the real export, and not A- WF as A', () => {
    const map = mapHeaders(parseCsv(HEADERS)[0])
    expect(map).toMatchObject({ crn: 0, course: 1, instructor: 2, a: 3, b: 4, c: 5, d: 6, f: 7, wf: 8, dwf: 10, w: 11, gpa: 12, other: 13 })
  })

  it('names the missing columns and shows what it found', () => {
    expect(() => mapHeaders(['CRN', 'Course'])).toThrow(/Missing columns: instructor.*Headers found: "CRN", "Course"/)
  })
})

describe('readGradeFile', () => {
  it('reads a section', () => {
    const { rows, skipped } = readGradeFile(`${HEADERS}\n12483,MATH2212,"Baroonian, Mona",10,8,4,1,1,0,0,12.5%,2,3.05,1,27,T`)
    expect(skipped).toEqual([])
    expect(rows[0]).toEqual({
      crn: '12483', courseCode: 'MATH 2212', instructor: 'Baroonian, Mona',
      a: 10, b: 8, c: 4, d: 1, f: 1, w: 2, wf: 0, other: 1, gpa: 3.05, filePctDfw: 12.5,
    })
  })

  it('treats a blank count as zero and a blank average as unknown', () => {
    const { rows } = readGradeFile(`${HEADERS}\n1,CSC 1301,"Jones, Ann",30,,,,,,,,,,,30,T`)
    expect(rows[0]).toMatchObject({ a: 30, b: 0, gpa: null })
  })

  it('skips Staff, junk counts and rows without a CRN, and says which line', () => {
    const { rows, skipped } = readGradeFile(
      [HEADERS, '2,CSC 1301,Staff,1,1,1,1,1,0,0,,0,3,0,5,T', '3,CSC 1301,"Jones, Ann",x,1,1,1,1,0,0,,0,3,0,5,T', 'Total,,,,,,,,,,,,,,,'].join('\n')
    )
    expect(rows).toEqual([])
    expect(skipped.map((s) => s.line)).toEqual([2, 3, 4])
  })
})
