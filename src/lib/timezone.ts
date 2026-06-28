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
  // Validate it's a real IANA timezone; fall back to New York if not
  try {
    Intl.DateTimeFormat('en-US', { timeZone: resolved })
    return resolved
  } catch {
    return 'America/New_York'
  }
}

export function shiftToSocialHour(utcDate: Date, tz: string): Date {
  const localHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(utcDate),
    10
  )

  if (localHour >= 0 && localHour < 9) {
    // Get UTC offset for this timezone at this moment
    const utcStr = utcDate.toLocaleString('en-US', { timeZone: 'UTC' })
    const localStr = utcDate.toLocaleString('en-US', { timeZone: tz })
    const offsetMs = new Date(localStr).getTime() - new Date(utcStr).getTime()

    // Build a local "9:00am" on the same calendar day, then convert back to UTC
    const localDate = new Date(utcDate.getTime() + offsetMs)
    localDate.setHours(9, 0, 0, 0)
    return new Date(localDate.getTime() - offsetMs)
  }

  return utcDate
}
