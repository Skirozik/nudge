// SeatSnipe counts two semesters a year, in Eastern time. Spring is Jan 1 to
// Jul 31 (summer folds into it, since most students skip summer) and fall is
// Aug 1 to Dec 31. Free classes last until the end of the semester after the
// one they were earned in, and the referral cap of 3 resets each semester.

function easternYearMonth(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month') }
}

/** "2026-fall" or "2027-spring" */
export function semesterOf(date: Date): string {
  const { year, month } = easternYearMonth(date)
  return `${year}-${month <= 7 ? 'spring' : 'fall'}`
}

/** The last moment of the semester after the one `date` falls in, Eastern time */
export function endOfNextSemester(date: Date): Date {
  const { year, month } = easternYearMonth(date)
  // Jul 31 is always daylight time and Dec 31 always standard time
  return month <= 7
    ? new Date(`${year}-12-31T23:59:59.999-05:00`)
    : new Date(`${year + 1}-07-31T23:59:59.999-04:00`)
}
