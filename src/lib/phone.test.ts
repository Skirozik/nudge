import { describe, it, expect } from 'vitest'
import { normalizePhone } from './phone'

describe('normalizePhone', () => {
  it('10-digit number → E.164 with +1', () => {
    expect(normalizePhone('7704803483')).toBe('+17704803483')
  })

  it('11-digit number starting with 1 → E.164', () => {
    expect(normalizePhone('17704803483')).toBe('+17704803483')
  })

  it('already E.164 → unchanged', () => {
    expect(normalizePhone('+17704803483')).toBe('+17704803483')
  })

  it('formatted (555) 123-4567 → E.164', () => {
    expect(normalizePhone('(770) 480-3483')).toBe('+17704803483')
  })

  it('formatted 555-123-4567 → E.164', () => {
    expect(normalizePhone('770-480-3483')).toBe('+17704803483')
  })

  it('iMessage email handle → lowercase as-is', () => {
    expect(normalizePhone('User@iCloud.com')).toBe('user@icloud.com')
  })

  it('trims whitespace before processing', () => {
    expect(normalizePhone('  +17704803483  ')).toBe('+17704803483')
  })
})
