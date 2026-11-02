// The address students text SeatSnipe at, and the site that links to it. The
// site, referral links and payment texts all read these so they can't drift.
export const SEATSNIPE_HANDLE = 'seatsnipe@icloud.com'
export const SEATSNIPE_URL = (process.env.SEATSNIPE_URL ?? 'https://getseatsnipe.com').replace(/\/+$/, '')
export const SEATSNIPE_SUPPORT_EMAIL = 'support@getseatsnipe.com'

// Opens Messages to SeatSnipe, with `body` typed in when given. The handle is an
// iCloud email, so this only works on Apple devices. iPhone reads the body
// after "&"; try it on a real phone before changing the form.
export function seatsnipeSmsLink(body?: string): string {
  return body ? `sms:${SEATSNIPE_HANDLE}&body=${encodeURIComponent(body)}` : `sms:${SEATSNIPE_HANDLE}`
}
