import { describe, it, expect } from 'vitest'
import { normalizeReferralCode, referralText, REFERRAL_CODE_ALPHABET } from './referrals'
import { seatsnipeSmsLink } from './seatsnipeBrand'

describe('normalizeReferralCode', () => {
  it('upper-cases and trims a code from a link or a text', () => {
    expect(normalizeReferralCode('kx7b2q')).toBe('KX7B2Q')
    expect(normalizeReferralCode(' KX7B2Q ')).toBe('KX7B2Q')
  })

  it('rejects anything the alphabet could not have made', () => {
    expect(normalizeReferralCode('KX7B2')).toBeNull() // too short
    expect(normalizeReferralCode('KX7B2QQ')).toBeNull() // too long
    expect(normalizeReferralCode('KX7B2A')).toBeNull() // vowel
    expect(normalizeReferralCode('KX7B20')).toBeNull() // 0 reads as O
    expect(normalizeReferralCode('KX7B2L')).toBeNull() // L reads as 1
    expect(normalizeReferralCode('refund')).toBeNull()
  })

  it('has no vowels or look-alike characters', () => {
    expect(REFERRAL_CODE_ALPHABET).not.toMatch(/[AEIOU01L]/)
  })
})

describe('referral link', () => {
  it('opens Messages to SeatSnipe with the code typed in', () => {
    expect(seatsnipeSmsLink(referralText('KX7B2Q'))).toBe('sms:seatsnipe@icloud.com&body=SeatSnipe%20code%20KX7B2Q')
    expect(seatsnipeSmsLink()).toBe('sms:seatsnipe@icloud.com')
  })
})
