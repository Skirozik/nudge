import { describe, it, expect, vi, beforeEach } from 'vitest'

// Each delete returns a label, so the transaction's order can be checked
vi.mock('./prisma', () => {
  const del = (label: string) => vi.fn(() => label)
  return {
    prisma: {
      user: { findUnique: vi.fn(), update: vi.fn(), delete: del('user') },
      reminder: { deleteMany: del('reminder') },
      assignment: { deleteMany: del('assignment') },
      conversation: { deleteMany: del('conversation') },
      message: { deleteMany: del('message') },
      oneOffReminder: { deleteMany: del('oneOffReminder') },
      session: { deleteMany: del('session') },
      watch: { deleteMany: del('watch') },
      locationReminder: { deleteMany: del('locationReminder') },
      metricEvent: { deleteMany: del('metricEvent') },
      $transaction: vi.fn(),
    },
  }
})

import { startNewUserTest, endNewUserTest, parkedPhone } from './testMode'
import { prisma } from './prisma'

const PHONE = '+17705550100'
const PARKED = parkedPhone(PHONE)

const mockFind = prisma.user.findUnique as ReturnType<typeof vi.fn>
const mockUpdate = prisma.user.update as ReturnType<typeof vi.fn>
const mockTx = prisma.$transaction as ReturnType<typeof vi.fn>

// phone → user row, read by findUnique({ where: { phone } })
let rows: Record<string, { id: string }>

beforeEach(() => {
  vi.clearAllMocks()
  rows = {}
  mockFind.mockImplementation(async ({ where }) => rows[where.phone] ?? null)
  mockUpdate.mockImplementation(({ where, data }) => `update ${where.id} → ${data.phone}`)
  mockTx.mockResolvedValue([])
})

const DELETE_ORDER = [
  'reminder',
  'assignment',
  'conversation',
  'message',
  'oneOffReminder',
  'session',
  'watch',
  'locationReminder',
  'metricEvent',
  'user',
]

describe('NEWUSER', () => {
  it('parks the real account so the next text is a first text', async () => {
    rows[PHONE] = { id: 'real' }
    const reply = await startNewUserTest(PHONE)
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'real' }, data: { phone: PARKED } })
    expect(reply).toContain('test mode on')
    expect(mockTx).not.toHaveBeenCalled()
  })

  it('never parks anything when there is no account yet', async () => {
    const reply = await startNewUserTest(PHONE)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(reply).toContain("don't have an account yet")
  })

  it('again while on: wipes the test account, children first, and keeps the real one parked', async () => {
    rows[PARKED] = { id: 'real' }
    rows[PHONE] = { id: 'test' }
    const reply = await startNewUserTest(PHONE)
    expect(mockTx).toHaveBeenCalledWith(DELETE_ORDER)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(reply).toContain('restarted')
  })

  it('the parked phone can never match an inbound number', () => {
    expect(PARKED).not.toMatch(/^\+\d+$/)
  })
})

describe('NEWUSER OFF', () => {
  it('deletes the test account and restores the real one in one transaction', async () => {
    rows[PARKED] = { id: 'real' }
    rows[PHONE] = { id: 'test' }
    const reply = await endNewUserTest(PHONE)
    expect(mockTx).toHaveBeenCalledWith([...DELETE_ORDER, `update real → ${PHONE}`])
    expect(reply).toContain('your account is back')
  })

  it('restores the real one even if no test text was ever sent', async () => {
    rows[PARKED] = { id: 'real' }
    await endNewUserTest(PHONE)
    expect(mockTx).toHaveBeenCalledWith([`update real → ${PHONE}`])
  })

  it('does nothing when test mode is off', async () => {
    rows[PHONE] = { id: 'real' }
    const reply = await endNewUserTest(PHONE)
    expect(mockTx).not.toHaveBeenCalled()
    expect(reply).toContain("isn't on")
  })
})
