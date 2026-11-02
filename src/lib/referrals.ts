// Referral codes are 6 characters from digits 2-9 and consonants, so they can't
// be misread (no 0/O or 1/I/L) and can't spell words
export const REFERRAL_CODE_ALPHABET = '23456789BCDFGHJKMNPQRSTVWXZ'
export const REFERRAL_CODE_LENGTH = 6

/** A code as typed or in a link ("kx7b2q") → its stored form ("KX7B2Q"), or null if it can't be a code */
export function normalizeReferralCode(raw: string): string | null {
  const code = raw.trim().toUpperCase()
  if (code.length !== REFERRAL_CODE_LENGTH) return null
  return [...code].every((c) => REFERRAL_CODE_ALPHABET.includes(c)) ? code : null
}

/** What a referral link types into Messages for the friend */
export function referralText(code: string): string {
  return `SeatSnipe code ${code}`
}
