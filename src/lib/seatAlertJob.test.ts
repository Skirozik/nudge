import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./prisma', () => ({
  prisma: {
    watch: { findUnique: vi.fn() },
    message: { create: vi.fn() },
  },
}))
vi.mock('./watches', () => ({ logMetric: vi.fn(), MAX_ALERTS_PER_WATCH: 3 }))

import { processSeatAlertJob } from './seatAlertJob'
import { prisma } from './prisma'
import { logMetric } from './watches'

const findWatch = prisma.watch.findUnique as ReturnType<typeof vi.fn>
const createMessage = prisma.message.create as ReturnType<typeof vi.fn>
const data = { watchId: 'w1', alertNumber: 1, seats: 2, seatEventId: 'e1', claimedAt: 1 }
const watch = {
  id: 'w1', userId: 'u1', school: 'gsu', courseCode: 'CSC 1301', crn: '90476', sectionLabel: 'Sec 002',
  status: 'ACTIVE', user: { phone: '+14045550123', optedOut: false },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  findWatch.mockResolvedValue(watch)
})

describe('processSeatAlertJob', () => {
  it('does not throw when logging the message fails after a delivered send', async () => {
    const send = vi.fn(async () => {})
    createMessage.mockRejectedValueOnce(new Error('db down'))

    await expect(processSeatAlertJob(data, send)).resolves.toBeUndefined()

    expect(send).toHaveBeenCalledOnce()
    // the metric still gets its own try
    expect(logMetric).toHaveBeenCalledWith('alert_sent', 'u1', expect.objectContaining({ watchId: 'w1' }))
  })

  it('does not throw when the metric fails after a delivered send', async () => {
    vi.mocked(logMetric).mockRejectedValueOnce(new Error('db down'))
    await expect(processSeatAlertJob(data, vi.fn(async () => {}))).resolves.toBeUndefined()
  })

  it('still throws when the send itself fails, so BullMQ retries it', async () => {
    const send = vi.fn(async () => { throw new Error('BlueBubbles API error 502') })
    await expect(processSeatAlertJob(data, send)).rejects.toThrow('502')
    expect(createMessage).not.toHaveBeenCalled()
  })

  it('sends nothing for a cancelled watch', async () => {
    findWatch.mockResolvedValueOnce({ ...watch, status: 'CANCELLED' })
    const send = vi.fn(async () => {})
    await processSeatAlertJob(data, send)
    expect(send).not.toHaveBeenCalled()
  })

  it('names the register site and the seat count', async () => {
    const send = vi.fn(async (phone: string, msg: string) => { void phone; void msg })
    await processSeatAlertJob(data, send)
    expect(send.mock.calls[0][1]).toBe('🚨 Seat opened in CSC 1301 (Sec 002), 2 seats available! Register at gosolar.gsu.edu before it fills up.')
  })
})
