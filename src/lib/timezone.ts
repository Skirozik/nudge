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
  const localHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(utcDate),
    10
  )

  if (localHour >= 9) return utcDate

  // Pure UTC arithmetic — avoids server-timezone setHours bug
  const offsetMs = getUtcOffsetMs(tz, utcDate)
  const localTimeMs = utcDate.getTime() + offsetMs
  const localMidnightMs = Math.floor(localTimeMs / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000)
  return new Date(localMidnightMs + 9 * 60 * 60 * 1000 - offsetMs)
}
