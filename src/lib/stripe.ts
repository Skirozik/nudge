// The only file that talks to Stripe. For now it only reads which key is set;
// checkout and webhooks come with the payments PR.

export type StripeMode = 'off' | 'test' | 'live'

/** Which kind of Stripe key is set. No network call, and a missing or unknown key is off. */
export function stripeMode(): StripeMode {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? ''
  if (/^(sk|rk)_live_/.test(key)) return 'live'
  if (/^(sk|rk)_test_/.test(key)) return 'test'
  return 'off'
}
