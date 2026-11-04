import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({ default: class {} }))
vi.mock('./prisma', () => ({ prisma: { assignment: { create: vi.fn() } } }))
vi.mock('./queue', () => ({
  scheduleReminders: vi.fn(),
  cancelPendingReminders: vi.fn(),
  scheduleOneOffReminder: vi.fn(),
  scheduleCheckIn: vi.fn(),
  scheduleFollowUp: vi.fn(),
}))
vi.mock('./watches', () => ({ listWatches: vi.fn(), cancelWatch: vi.fn() }))
vi.mock('./seatsnipeTools', () => ({ watchCourse: vi.fn(), setSchool: vi.fn() }))
vi.mock('./locationToken', () => ({ getOrCreateLocationToken: vi.fn() }))
vi.mock('./conversation', () => ({ freshHistory: vi.fn(), startWithUser: vi.fn() }))

import { executeTool } from './agent'
import { prisma } from './prisma'
import { scheduleReminders, scheduleOneOffReminder } from './queue'

const create = prisma.assignment.create as ReturnType<typeof vi.fn>
const NY = 'America/New_York'
const YEAR_AHEAD = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).getFullYear()

beforeEach(() => {
  vi.clearAllMocks()
  create.mockResolvedValue({ id: 'a1', dueAt: new Date(), reminderOffsets: [24] })
})

describe('add_assignment', () => {
  it('saves nothing and tells the model when the date is in the past', async () => {
    const result = await executeTool('add_assignment', { title: 'Finish my essay', due_at: '2024-11-08T17:00:00-05:00' }, 'u1', NY)
    expect(result).toMatchObject({ error: expect.stringContaining('in the past') })
    expect(create).not.toHaveBeenCalled()
    expect(scheduleReminders).not.toHaveBeenCalled()
  })

  it('saves a future date', async () => {
    const result = await executeTool('add_assignment', { title: 'Finish my essay', due_at: `${YEAR_AHEAD}-11-06T17:00:00-05:00` }, 'u1', NY)
    expect(result).toMatchObject({ success: true })
    expect(create).toHaveBeenCalledOnce()
    expect(scheduleReminders).toHaveBeenCalledOnce()
  })
})

describe('set_reminder', () => {
  it('schedules nothing and tells the model when the time is in the past', async () => {
    const result = await executeTool('set_reminder', { message: 'call mom', fire_at: '2024-11-08T17:00:00-05:00' }, 'u1', NY)
    expect(result).toMatchObject({ error: expect.stringContaining('in the past') })
    expect(scheduleOneOffReminder).not.toHaveBeenCalled()
  })

  it('schedules a future time', async () => {
    const result = await executeTool('set_reminder', { message: 'call mom', fire_at: `${YEAR_AHEAD}-11-06T17:00:00-05:00` }, 'u1', NY)
    expect(result).toMatchObject({ success: true })
    expect(scheduleOneOffReminder).toHaveBeenCalledOnce()
  })
})
