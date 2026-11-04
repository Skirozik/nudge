import { describe, it, expect, vi, beforeEach } from 'vitest'

// A queue that behaves like BullMQ on ids: adding an id that already exists
// (completed jobs are removed, failed ones are kept) is silently ignored.
const { jobs, add } = vi.hoisted(() => {
  const jobs = new Map<string, { name: string; data: unknown; opts: Record<string, unknown> }>()
  const add = vi.fn(async (name: string, data: unknown, opts: Record<string, unknown> & { jobId?: string }) => {
    if (opts.jobId && jobs.has(opts.jobId)) return { id: opts.jobId }
    jobs.set(opts.jobId ?? String(jobs.size), { name, data, opts })
    return { id: opts.jobId }
  })
  return { jobs, add }
})
vi.mock('bullmq', () => ({ Queue: class { add = add } }))
vi.mock('./prisma', () => ({ prisma: {} }))

import { scheduleSeatAlert, seatAlertJobId, SEAT_ALERT_ATTEMPTS, SEAT_ALERT_BACKOFF_MS } from './queue'

const base = { watchId: 'w1', seats: 2, seatEventId: 'e1' }

beforeEach(() => {
  jobs.clear()
  add.mockClear()
})

describe('scheduleSeatAlert', () => {
  it('retries for several minutes before giving up', async () => {
    await scheduleSeatAlert({ ...base, alertNumber: 1, claimedAt: new Date(1000) })

    const opts = add.mock.calls[0][2]
    expect(opts).toMatchObject({ attempts: SEAT_ALERT_ATTEMPTS, backoff: { type: 'exponential', delay: SEAT_ALERT_BACKOFF_MS }, removeOnFail: false })
    // BullMQ waits delay * 2^(n-1) before retry n
    const totalWaitMs = Array.from({ length: SEAT_ALERT_ATTEMPTS - 1 }, (_, i) => SEAT_ALERT_BACKOFF_MS * 2 ** i).reduce((a, b) => a + b, 0)
    expect(totalWaitMs).toBeGreaterThanOrEqual(3 * 60_000)
  })

  it('carries the claim time in the job', async () => {
    await scheduleSeatAlert({ ...base, alertNumber: 1, claimedAt: new Date(1234) })
    expect(add.mock.calls[0][1]).toMatchObject({ watchId: 'w1', alertNumber: 1, claimedAt: 1234 })
  })

  it('keeps one id per claim, so the same claim never queues twice', async () => {
    const claim = { ...base, alertNumber: 1, claimedAt: new Date(5000) }
    await scheduleSeatAlert(claim)
    await scheduleSeatAlert(claim)
    expect(jobs.size).toBe(1)
  })

  it('gives two claims different ids', () => {
    expect(seatAlertJobId('w1', 2, new Date(1))).not.toBe(seatAlertJobId('w1', 2, new Date(2)))
  })

  it('a failed alert 1 no longer blocks alert 1 after a re-arm', async () => {
    // Alert 1 fails for good and BullMQ keeps the failed job
    await scheduleSeatAlert({ ...base, alertNumber: 1, claimedAt: new Date('2026-11-04T15:00:00Z') })
    // The student re-arms, alertCount goes back to 0, and the next opening claims alert 1 again
    await scheduleSeatAlert({ ...base, alertNumber: 1, seatEventId: 'e2', claimedAt: new Date('2026-11-04T16:30:00Z') })

    expect(jobs.size).toBe(2)
    expect([...jobs.values()].map((j) => (j.data as { seatEventId: string }).seatEventId)).toEqual(['e1', 'e2'])
  })
})
