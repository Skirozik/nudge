// When SeatSnipe starts charging: Nov 20 2026, 12:00 AM Eastern. Watches set up
// before this stay free all semester. SEATSNIPE_PAID_FROM moves it (the Nov 17
// fallback) and has to be a full ISO time with Z or an offset, like
// 2026-11-27T00:00:00-05:00, so it can't be read in the wrong timezone.
export const DEFAULT_PAID_FROM = new Date('2026-11-20T00:00:00-05:00')

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/

export function parsePaidFrom(raw: string | undefined): Date {
  const value = raw?.trim()
  if (!value) return DEFAULT_PAID_FROM
  const date = new Date(value)
  // A typo'd year would start charging early or never, so only this launch's years count
  const year = date.getUTCFullYear()
  if (!ISO_WITH_ZONE.test(value) || Number.isNaN(date.getTime()) || year < 2026 || year > 2027) {
    console.warn(`[payments] SEATSNIPE_PAID_FROM isn't an ISO time with a timezone, using ${DEFAULT_PAID_FROM.toISOString()}`)
    return DEFAULT_PAID_FROM
  }
  return date
}

export const PAID_FROM = parsePaidFrom(process.env.SEATSNIPE_PAID_FROM)

/** "Nov 20" (or "Nov 20, 2026"), in Eastern time, for texts, the agent prompt and the site */
export function paidFromLabel(date: Date = PAID_FROM, withYear = false): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear && { year: 'numeric' }),
    timeZone: 'America/New_York',
  })
}
