import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./adminNotice', () => ({ notifyAdminDaily: vi.fn() }))
vi.mock('../stripe', () => ({ stripeMode: vi.fn(() => 'off') }))

import { decideEntitlement, paidMode } from './rules'
import { DEFAULT_PAID_FROM } from './paidFrom'
import { notifyAdminDaily } from './adminNotice'
import { stripeMode } from '../stripe'

const mockNotify = notifyAdminDaily as ReturnType<typeof vi.fn>
const mockStripeMode = stripeMode as ReturnType<typeof vi.fn>

// Nov 20 2026 12:00 AM Eastern is 05:00Z
const CUTOFF = DEFAULT_PAID_FROM
const AFTER = new Date('2026-11-21T15:00:00Z')
const SECTION = { school: 'gsu', term: '202701', crn: '12345', courseCode: 'CSC 2720' }

function decide(overrides: Partial<Parameters<typeof decideEntitlement>[0]> = {}) {
  return decideEntitlement({
    at: AFTER,
    mode: 'on',
    cutoff: CUTOFF,
    section: SECTION,
    watches: [],
    passes: [],
    credits: [],
    ...overrides,
  })
}

const watch = (createdAt: string, over: Partial<typeof SECTION> = {}) => ({
  school: 'gsu',
  term: '202701',
  crn: '12345',
  createdAt: new Date(createdAt),
  ...over,
})
const credit = (id: string, expiresAt: string, over: { usedAt?: Date | null; createdAt?: string } = {}) => ({
  id,
  expiresAt: new Date(expiresAt),
  usedAt: over.usedAt ?? null,
  createdAt: new Date(over.createdAt ?? '2026-10-01T00:00:00Z'),
})

describe('decideEntitlement', () => {
  it('is free while paid mode is off', () => {
    expect(decide({ mode: 'off' })).toEqual({ kind: 'free', why: 'paid_mode_off' })
  })

  it("is free when Stripe isn't live, even with nothing else in its favor", () => {
    expect(decide({ mode: 'stripe_not_live' })).toEqual({ kind: 'free', why: 'stripe_not_live' })
  })

  it('keeps a section first watched one second before the cutoff free', () => {
    expect(decide({ watches: [watch('2026-11-20T04:59:59Z')] })).toEqual({ kind: 'free', why: 'grandfathered' })
  })

  it('charges for a section first watched right at the cutoff', () => {
    expect(decide({ watches: [watch('2026-11-20T05:00:00Z')] })).toEqual({ kind: 'needs_payment' })
  })

  it('charges for a new section in a class they watched for free before the cutoff', () => {
    expect(decide({ watches: [watch('2026-11-10T12:00:00Z', { crn: '99999' })] })).toEqual({ kind: 'needs_payment' })
  })

  it("only grandfathers the same school and term", () => {
    expect(decide({ watches: [watch('2026-11-10T12:00:00Z', { term: '202608' })] })).toEqual({ kind: 'needs_payment' })
    expect(decide({ watches: [watch('2026-11-10T12:00:00Z', { school: 'gatech' })] })).toEqual({ kind: 'needs_payment' })
  })

  it('a paid class covers a different section of it', () => {
    const passes = [{ id: 'pass1', school: 'gsu', term: '202701', courseCode: 'CSC 2720' }]
    expect(decide({ passes })).toEqual({ kind: 'covered', passId: 'pass1' })
  })

  it("a pass for another class or term doesn't cover this one", () => {
    const passes = [
      { id: 'other', school: 'gsu', term: '202701', courseCode: 'CSC 3320' },
      { id: 'old', school: 'gsu', term: '202608', courseCode: 'CSC 2720' },
    ]
    expect(decide({ passes })).toEqual({ kind: 'needs_payment' })
  })

  it('grandfathering wins over a pass, and a pass wins over a free class', () => {
    const passes = [{ id: 'pass1', school: 'gsu', term: '202701', courseCode: 'CSC 2720' }]
    const credits = [credit('c1', '2027-07-31T00:00:00Z')]
    expect(decide({ watches: [watch('2026-11-01T00:00:00Z')], passes, credits })).toEqual({
      kind: 'free',
      why: 'grandfathered',
    })
    expect(decide({ passes, credits })).toEqual({ kind: 'covered', passId: 'pass1' })
  })

  it('offers the soonest-expiring free class, and the oldest on a tie', () => {
    const credits = [
      credit('later', '2027-12-31T00:00:00Z'),
      credit('newer', '2027-07-31T00:00:00Z', { createdAt: '2026-11-15T00:00:00Z' }),
      credit('older', '2027-07-31T00:00:00Z', { createdAt: '2026-11-01T00:00:00Z' }),
    ]
    expect(decide({ credits })).toEqual({ kind: 'offer_credit', creditId: 'older' })
  })

  it('skips used and expired free classes', () => {
    const credits = [
      credit('used', '2027-07-31T00:00:00Z', { usedAt: new Date('2026-11-21T00:00:00Z') }),
      credit('expired', '2026-11-21T15:00:00Z'),
    ]
    expect(decide({ credits })).toEqual({ kind: 'needs_payment' })
  })
})

describe('paidMode', () => {
  const BEFORE = new Date('2026-11-20T04:59:59Z')
  const AT_CUTOFF = new Date('2026-11-20T05:00:00Z')
  const ME = '+14045550123'

  beforeEach(() => {
    vi.clearAllMocks()
    mockStripeMode.mockReturnValue('off')
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
    vi.stubEnv('SEATSNIPE_PAID_PREVIEW', '')
    vi.stubEnv('SEATSNIPE_PAID_FROM', '')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('is off one second before Nov 20, even with live keys', () => {
    mockStripeMode.mockReturnValue('live')
    expect(paidMode(ME, BEFORE)).toBe('off')
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('is on from Nov 20 with a live key', () => {
    mockStripeMode.mockReturnValue('live')
    expect(paidMode(ME, AT_CUTOFF)).toBe('on')
  })

  it("is stripe_not_live from Nov 20 with no key, and texts the admin", () => {
    expect(paidMode(ME, AT_CUTOFF)).toBe('stripe_not_live')
    expect(mockNotify).toHaveBeenCalledWith('stripe-not-live', expect.stringContaining('free right now'))
  })

  it('never charges real students with test keys', () => {
    mockStripeMode.mockReturnValue('test')
    expect(paidMode(ME, AT_CUTOFF)).toBe('stripe_not_live')
  })

  it('needs the webhook secret on Vercel', () => {
    mockStripeMode.mockReturnValue('live')
    vi.stubEnv('VERCEL', '1')
    expect(paidMode(ME, AT_CUTOFF)).toBe('stripe_not_live')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_x')
    expect(paidMode(ME, AT_CUTOFF)).toBe('on')
  })

  it('preview handles pay before Nov 20 and can use test keys', () => {
    mockStripeMode.mockReturnValue('test')
    vi.stubEnv('SEATSNIPE_PAID_PREVIEW', '(404) 555-0123, friend@icloud.com')
    expect(paidMode(ME, BEFORE)).toBe('on')
    expect(paidMode('Friend@iCloud.com', BEFORE)).toBe('on')
    expect(paidMode('+17705550100', BEFORE)).toBe('off')
  })

  it('texts the admin about a SEATSNIPE_PAID_FROM it ignored', () => {
    vi.stubEnv('SEATSNIPE_PAID_FROM', 'Nov 27')
    paidMode(ME, BEFORE)
    expect(mockNotify).toHaveBeenCalledWith('paid-from', expect.stringContaining('SEATSNIPE_PAID_FROM'))
  })

  it('never throws, and treats a broken check as free', () => {
    mockStripeMode.mockImplementation(() => {
      throw new Error('boom')
    })
    expect(paidMode(ME, AT_CUTOFF)).toBe('stripe_not_live')
    expect(paidMode(ME, BEFORE)).toBe('off')
  })
})
