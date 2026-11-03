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
      a: 10, b: 8, c: 4, d: 1, f: 1, w: 2, wf: 0, other: 1, gpa: 3.05, filePctDfw: 12.5, fileTotal: 27,
    })
  })

  it('reads a real Spring 2026 row, where a missing average is "-"', () => {
    const real = 'CRN,Course,Professor,A (90-100),B (80-89),C (70-79),D (60-69),F <60,WF,A- WF,DWF,W,CRS AVG,Other,Total,Instruction Method'
    const { rows } = readGradeFile(`${real}\n10001,ACCT 2102,"Yorke, Sally",160,106,41,14,5,0,326,7.8%,7,3.29,1,334,T\n10016,ANTH 8065,"Turner-Livermore, Bethany",0,0,0,0,0,0,0,5.9%,1,-,16,17,P`)
    expect(rows[0]).toMatchObject({ crn: '10001', a: 160, f: 5, wf: 0, w: 7, other: 1, gpa: 3.29, filePctDfw: 7.8, fileTotal: 334 })
    expect(rows[1]).toMatchObject({ gpa: null, other: 16, fileTotal: 17 })
  })

  it('skips a blank professor, which the export writes as ","', () => {
    const { rows, skipped } = readGradeFile(`${HEADERS}\n10059,BA 8510,",",0,0,0,0,0,0,0,0.0%,0,-,520,520,T`)
    expect(rows).toEqual([])
    expect(skipped[0].line).toBe(2)
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
