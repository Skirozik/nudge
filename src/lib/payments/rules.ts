import { normalizePhone } from '../phone'
import { stripeMode } from '../stripe'
import { notifyAdminDaily } from './adminNotice'
import { PAID_FROM, isValidPaidFrom } from './paidFrom'

// What a new SeatSnipe watch costs. decideEntitlement is pure, so every rule is
// a table test. paidMode is the one part that reads the environment.

export type PaidMode = 'on' | 'off' | 'stripe_not_live'

export type Entitlement =
  | { kind: 'free'; why: 'paid_mode_off' | 'stripe_not_live' | 'grandfathered' }
  | { kind: 'covered'; passId: string }
  | { kind: 'offer_credit'; creditId: string }
  | { kind: 'needs_payment' }

export function decideEntitlement(i: {
  /** Decision time: when they texted, which can be earlier than now on a replay */
  at: Date
  mode: PaidMode
  /** PAID_FROM. Sections first watched before this stay free all semester. */
  cutoff: Date
  section: { school: string; term: string; crn: string; courseCode: string }
  /** The user's watches in any status, so a cancelled or retired section still counts */
  watches: Array<{ school: string; term: string; crn: string; createdAt: Date }>
  passes: Array<{ id: string; school: string; term: string; courseCode: string }>
  credits: Array<{ id: string; expiresAt: Date; usedAt: Date | null; createdAt: Date }>
}): Entitlement {
  const { section } = i
  if (i.mode !== 'on') return { kind: 'free', why: i.mode === 'off' ? 'paid_mode_off' : 'stripe_not_live' }

  // Re-arming after 3 alerts or cancel and re-add, on a section from before the cutoff
  const grandfathered = i.watches.some(
    (w) => w.school === section.school && w.term === section.term && w.crn === section.crn && w.createdAt < i.cutoff
  )
  if (grandfathered) return { kind: 'free', why: 'grandfathered' }

  // One payment covers every section of the class for the term
  const pass = i.passes.find(
    (p) => p.school === section.school && p.term === section.term && p.courseCode === section.courseCode
  )
  if (pass) return { kind: 'covered', passId: pass.id }

  // The soonest-expiring free class goes first, and the oldest on a tie
  const credit = i.credits
    .filter((c) => c.usedAt === null && c.expiresAt > i.at)
    .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime())[0]
  if (credit) return { kind: 'offer_credit', creditId: credit.id }

  return { kind: 'needs_payment' }
}

/** Handles in SEATSNIPE_PAID_PREVIEW pay now, before PAID_FROM, and may use test keys */
function previewHandles(): Set<string> {
  const raw = process.env.SEATSNIPE_PAID_PREVIEW ?? ''
  // Commas only: a number like "(404) 555-0123" has spaces in it
  return new Set(
    raw
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean)
      .map(normalizePhone)
  )
}

/** One line with no secrets, so the logs show what payments will do */
export function paymentsStartupLine(): string {
  return `[payments] stripe=${stripeMode()} paidFrom=${PAID_FROM.toISOString()} preview=${previewHandles().size} handles`
}

let loggedStartup = false

/**
 * Whether a watch for this handle, decided at `at`, goes through payments.
 * 'stripe_not_live' means it's past PAID_FROM but Stripe isn't ready, so classes
 * are free and the admin gets a text. Never throws.
 */
export function paidMode(handle: string, at: Date): PaidMode {
  try {
    if (!loggedStartup) {
      loggedStartup = true
      console.log(paymentsStartupLine())
    }
    const rawPaidFrom = process.env.SEATSNIPE_PAID_FROM?.trim()
    if (rawPaidFrom && !isValidPaidFrom(rawPaidFrom)) {
      notifyAdminDaily(
        'paid-from',
        `SeatSnipe: SEATSNIPE_PAID_FROM isn't a full time with a timezone, so payments start ${PAID_FROM.toISOString()}. Use a value like 2026-11-27T00:00:00-05:00.`
      )
    }

    const preview = previewHandles().has(normalizePhone(handle))
    if (!preview && at < PAID_FROM) return 'off'

    const mode = stripeMode()
    // Test keys only ever charge preview handles, so real students never get a fake link
    const keyReady = mode === 'live' || (preview && mode === 'test')
    // On Vercel the webhook marks payments paid, so it needs its secret too
    const webhookReady = !process.env.VERCEL || !!process.env.STRIPE_WEBHOOK_SECRET?.trim()
    if (keyReady && webhookReady) return 'on'

    notifyAdminDaily(
      'stripe-not-live',
      `SeatSnipe: new classes are free right now because Stripe isn't ready (stripe=${mode}${webhookReady ? '' : ', no webhook secret'}).`
    )
    return 'stripe_not_live'
  } catch (err) {
    console.error('[payments] paidMode failed, treating the class as free:', err)
    return at < PAID_FROM ? 'off' : 'stripe_not_live'
  }
}
