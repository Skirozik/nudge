import { describe, it, expect, afterEach, vi } from 'vitest'
import { resolveSchool, isLive, getSchool, liveSchools, termWatchEnd } from './index'
import { normalizeSubject } from '../banner'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveSchool', () => {
  it.each([
    ['GSU', 'gsu'],
    ['georgia state', 'gsu'],
    ['Georgia State.', 'gsu'],
    ['GT', 'gatech'],
    ['Georgia Tech', 'gatech'],
    ['ga tech', 'gatech'],
    ['UGA', 'uga'],
    ['Kennesaw State', 'kennesaw'],
    ['KSU', 'kennesaw'],
  ])('%s → %s', (input, id) => {
    expect(resolveSchool(input)?.id).toBe(id)
  })

  it('returns undefined for schools it does not know', () => {
    expect(resolveSchool('Emory')).toBeUndefined()
    expect(resolveSchool('   ')).toBeUndefined()
  })
})

describe('isLive', () => {
  it('defaults to GSU only', () => {
    expect(liveSchools().map((s) => s.id)).toEqual(['gsu'])
  })

  it('needs a banner config even when enabled', () => {
    vi.stubEnv('ENABLED_SCHOOLS', 'gsu,gatech')
    expect(isLive(getSchool('gatech'))).toBe(false)
    expect(isLive(getSchool('gsu'))).toBe(true)
  })

  it('is off when the school is not in ENABLED_SCHOOLS', () => {
    vi.stubEnv('ENABLED_SCHOOLS', 'gatech')
    expect(isLive(getSchool('gsu'))).toBe(false)
  })
})

describe('termWatchEnd', () => {
  it('prefers the per-school variable', () => {
    vi.stubEnv('TERM_WATCH_END', '2026-08-01T00:00:00Z')
    vi.stubEnv('TERM_WATCH_END_GSU', '2027-01-20T00:00:00Z')
    expect(termWatchEnd(getSchool('gsu')!)?.toISOString()).toBe('2027-01-20T00:00:00.000Z')
  })

  it('lets GSU fall back to the older TERM_WATCH_END, but no other school', () => {
    vi.stubEnv('TERM_WATCH_END', '2026-08-01T00:00:00Z')
    expect(termWatchEnd(getSchool('gsu')!)?.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(termWatchEnd(getSchool('gatech')!)).toBeNull()
  })

  it('ignores a value that is not a date', () => {
    vi.stubEnv('TERM_WATCH_END_GSU', 'next friday')
    expect(termWatchEnd(getSchool('gsu')!)).toBeNull()
  })
})

describe('normalizeSubject', () => {
  it("maps abbreviations to the school's subject codes", () => {
    const aliases = getSchool('gsu')!.banner!.subjectAliases
    expect(normalizeSubject('csci', aliases)).toBe('CSC')
    expect(normalizeSubject('Psych', aliases)).toBe('PSYC')
    expect(normalizeSubject('hist', aliases)).toBe('HIST')
  })
})
