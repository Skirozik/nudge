import { gsu } from './gsu'
import { gatech } from './gatech'
import { uga, kennesaw } from './upcoming'
import type { School, BannerConfig } from './types'

export type { School, BannerConfig }
export type LiveSchool = School & { banner: BannerConfig }

/** Every school SeatSnipe knows about. Add new ones here. */
export const SCHOOLS: School[] = [gsu, gatech, uga, kennesaw]

/** Comma-separated school ids that are switched on. Defaults to GSU only. */
function enabledIds(): string[] {
  return (process.env.ENABLED_SCHOOLS ?? 'gsu')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function getSchool(id: string | null | undefined): School | undefined {
  return id ? SCHOOLS.find((s) => s.id === id) : undefined
}

export function isLive(school: School | undefined): school is LiveSchool {
  return !!school?.banner && enabledIds().includes(school.id)
}

export function liveSchools(): LiveSchool[] {
  return SCHOOLS.filter(isLive)
}

export function getLiveSchool(id: string | null | undefined): LiveSchool | undefined {
  const school = getSchool(id)
  return isLive(school) ? school : undefined
}

/** "Georgia St." → "georgia st" */
export function normalizeSchoolName(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Match what a student typed ("GT", "georgia tech", "Georgia State") to a known school. */
export function resolveSchool(input: string): School | undefined {
  const key = normalizeSchoolName(input)
  if (!key) return undefined
  return SCHOOLS.find((s) => s.id === key || s.aliases.includes(key))
}

/**
 * When a school's watches stop for the term: TERM_WATCH_END_<ID> (e.g.
 * TERM_WATCH_END_GATECH). GSU also accepts the older TERM_WATCH_END.
 */
export function termWatchEnd(school: School): Date | null {
  const raw =
    process.env[`TERM_WATCH_END_${school.id.toUpperCase()}`] ??
    (school.id === 'gsu' ? process.env.TERM_WATCH_END : undefined)
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}
