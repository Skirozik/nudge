import { describe, it, expect } from 'vitest'
import { normalizePhone } from './phone'

describe('normalizePhone', () => {
  it('10-digit number → E.164 with +1', () => {
    expect(normalizePhone('4045550123')).toBe('+14045550123')
  })

  it('11-digit number starting with 1 → E.164', () => {
    expect(normalizePhone('14045550123')).toBe('+14045550123')
  })

  it('already E.164 → unchanged', () => {
    expect(normalizePhone('+14045550123')).toBe('+14045550123')
  })

  it('formatted (555) 123-4567 → E.164', () => {
    expect(normalizePhone('(404) 555-0123')).toBe('+14045550123')
  })

  it('formatted 555-123-4567 → E.164', () => {
    expect(normalizePhone('404-555-0123')).toBe('+14045550123')
  })

  it('iMessage email handle → lowercase as-is', () => {
    expect(normalizePhone('User@iCloud.com')).toBe('user@icloud.com')
  })

  it('trims whitespace before processing', () => {
    expect(normalizePhone('  +14045550123  ')).toBe('+14045550123')
  })
})
