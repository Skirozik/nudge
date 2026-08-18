const CITY_MAP: Record<string, string> = {
  'new york': 'America/New_York',
  nyc: 'America/New_York',
  'los angeles': 'America/Los_Angeles',
  la: 'America/Los_Angeles',
  chicago: 'America/Chicago',
  houston: 'America/Chicago',
  phoenix: 'America/Phoenix',
  philadelphia: 'America/New_York',
  'san antonio': 'America/Chicago',
  'san diego': 'America/Los_Angeles',
  dallas: 'America/Chicago',
  'san francisco': 'America/Los_Angeles',
  sf: 'America/Los_Angeles',
  seattle: 'America/Los_Angeles',
  denver: 'America/Denver',
  miami: 'America/New_York',
  atlanta: 'America/New_York',
  boston: 'America/New_York',
  detroit: 'America/Detroit',
  minneapolis: 'America/Chicago',
  portland: 'America/Los_Angeles',
  'las vegas': 'America/Los_Angeles',
  honolulu: 'Pacific/Honolulu',
  anchorage: 'America/Anchorage',
  london: 'Europe/London',
  paris: 'Europe/Paris',
  berlin: 'Europe/Berlin',
  tokyo: 'Asia/Tokyo',
  sydney: 'Australia/Sydney',
  toronto: 'America/Toronto',
  vancouver: 'America/Vancouver',
}

export function resolveTimezone(input: string): string {
  const lower = input.toLowerCase().trim()
  const resolved = CITY_MAP[lower] ?? input
  try {
    Intl.DateTimeFormat('en-US', { timeZone: resolved })
    return resolved
  } catch {
    return 'America/New_York'
  }
}

export function resolveTimezoneStrict(input: string): string | null {
  const lower = input.toLowerCase().trim()
  const resolved = CITY_MAP[lower] ?? input
  try {
    Intl.DateTimeFormat('en-US', { timeZone: resolved })
    return resolved
  } catch {
    return null
  }
}

function getUtcOffsetMs(tz: string, date: Date): number {
  const raw = new Intl.DateTimeFormat('en', {
    timeZone: tz,
    timeZoneName: 'longOffset',
  }).formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0'
  const match = raw.replace('GMT', '').match(/^([+-])(\d{2}):(\d{2})$/)
  if (!match) return 0
  const sign = match[1] === '+' ? 1 : -1
  return sign * (parseInt(match[2]) * 60 + parseInt(match[3])) * 60_000
}

export function shiftToSocialHour(utcDate: Date, tz: string): Date {
  // hourCycle h23 — `hour12: false` can yield "24" at midnight on some ICU builds,
  // which would make midnight look like a social hour (24 >= 9) and skip the shift
  const localHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(utcDate),
    10
  )

  if (Number.isNaN(localHour) || localHour >= 9) return utcDate

  // Pure UTC arithmetic — avoids server-timezone setHours bug
  const offsetMs = getUtcOffsetMs(tz, utcDate)
  const localTimeMs = utcDate.getTime() + offsetMs
  const localMidnightMs = Math.floor(localTimeMs / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000)
  // Second pass: the offset at 9 AM may differ from the offset now (DST transition day)
  const firstGuess = localMidnightMs + 9 * 60 * 60 * 1000 - offsetMs
  const offsetAtTarget = getUtcOffsetMs(tz, new Date(firstGuess))
  return new Date(localMidnightMs + 9 * 60 * 60 * 1000 - offsetAtTarget)
}

/**
 * Interpret an ISO-8601 string as WALL-CLOCK time in the given IANA timezone,
 * ignoring any UTC offset embedded in the string.
 *
 * Why: the agent stamps times with the user's CURRENT offset (e.g. -04:00 EDT).
 * For a due date on the other side of a DST switch (e.g. November, EST -05:00),
 * that offset is wrong by an hour. The user means "11:59 PM my time on that day" —
 * so we recompute the instant from the wall clock using the offset in effect
 * on the target date.
 */
export function parseInTimezone(iso: string, tz: string): Date {
  const fallback = new Date(iso)
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return fallback
  try {
    const wallUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0)
    // Two-pass: guess the offset from the wall time, then refine at the guessed instant
    const guess = wallUtc - getUtcOffsetMs(tz, new Date(wallUtc))
    const instant = wallUtc - getUtcOffsetMs(tz, new Date(guess))
    return new Date(instant)
  } catch {
    return fallback
  }
}
