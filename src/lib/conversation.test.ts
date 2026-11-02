import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./prisma', () => ({
  prisma: {
    conversation: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))

import { appendAssistantMessage, freshHistory, startWithUser, CONVERSATION_RESET_MS } from './conversation'
import { prisma } from './prisma'

const mockFind = prisma.conversation.findUnique as ReturnType<typeof vi.fn>
const mockUpsert = prisma.conversation.upsert as ReturnType<typeof vi.fn>

// The 2910 case: August's chat, where he set up ECON 2105 Sec 032, 034 and 040
const AUGUST = [
  { role: 'user', content: 'Now watch Econ sec 032,034,040' },
  { role: 'assistant', content: 'Got 032 and 034 added!' },
]
const BROADCAST = '🎯 SeatSnipe is back for Spring 2027!'

beforeEach(() => {
  vi.clearAllMocks()
  mockUpsert.mockResolvedValue({})
})

const savedMessages = () => mockUpsert.mock.calls[0][0].update.messages

describe('appendAssistantMessage', () => {
  it("starts a quiet chat over, so last semester's messages don't come back with the broadcast", async () => {
    mockFind.mockResolvedValue({ messages: AUGUST, updatedAt: new Date('2026-08-27T01:53:25Z') })
    await appendAssistantMessage('u1', BROADCAST)
    expect(savedMessages()).toEqual([{ role: 'assistant', content: BROADCAST }])
  })

  it('adds to a chat that is still going', async () => {
    mockFind.mockResolvedValue({ messages: AUGUST, updatedAt: new Date(Date.now() - 5 * 60 * 1000) })
    await appendAssistantMessage('u1', BROADCAST)
    expect(savedMessages()).toEqual([...AUGUST, { role: 'assistant', content: BROADCAST }])
  })

  it('creates the chat when there is none', async () => {
    mockFind.mockResolvedValue(null)
    await appendAssistantMessage('u1', BROADCAST)
    expect(mockUpsert.mock.calls[0][0].create.messages).toEqual([{ role: 'assistant', content: BROADCAST }])
  })
})

describe('freshHistory', () => {
  const now = new Date('2026-11-02T22:36:00Z')

  it('keeps a chat updated less than 30 minutes ago', () => {
    const updatedAt = new Date(now.getTime() - CONVERSATION_RESET_MS + 1000)
    expect(freshHistory({ messages: AUGUST, updatedAt }, now)).toEqual(AUGUST)
  })

  it('drops a chat quiet for more than 30 minutes', () => {
    const updatedAt = new Date(now.getTime() - CONVERSATION_RESET_MS - 1000)
    expect(freshHistory({ messages: AUGUST, updatedAt }, now)).toEqual([])
  })
})

describe('startWithUser', () => {
  it('puts a user turn before a chat the bot started', () => {
    const msgs = [
      { role: 'assistant' as const, content: BROADCAST },
      { role: 'user' as const, content: 'watch Econ sec 032,034,040' },
    ]
    expect(startWithUser(msgs)).toEqual([{ role: 'user', content: '(start of conversation)' }, ...msgs])
  })

  it('leaves a chat that already starts with them alone', () => {
    const msgs = [{ role: 'user' as const, content: 'hi' }]
    expect(startWithUser(msgs)).toBe(msgs)
  })
})
