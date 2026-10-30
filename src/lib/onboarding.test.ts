import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must be called before importing the module under test
vi.mock('./prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    message: { create: vi.fn() },
    conversation: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))
vi.mock('./bluebubbles', () => ({ sendMessage: vi.fn(), sendTypingIndicator: vi.fn() }))
vi.mock('./agent', () => ({ runAgent: vi.fn() }))
vi.mock('./outage', () => ({ clearNotified: vi.fn() }))

import {
  createUser,
  runWelcome,
  welcomeForPhoto,
  replayHeldText,
  heldTextNote,
  schoolReplyMessage,
  HELD_TEXT_TTL_MS,
} from './onboarding'
import { PICK_TEXTS, PICK_REASK, SEATSNIPE_WELCOME, NUDGE_WELCOME, DND_TIP, SCHOOL_QUESTION } from './pick'
import { prisma } from './prisma'
import { sendMessage } from './bluebubbles'
import { runAgent } from './agent'

const mockFindUser = prisma.user.findUnique as ReturnType<typeof vi.fn>
const mockUpdateMany = prisma.user.updateMany as ReturnType<typeof vi.fn>
const mockUpsertUser = prisma.user.upsert as ReturnType<typeof vi.fn>
const mockMessageCreate = prisma.message.create as ReturnType<typeof vi.fn>
const mockFindConvo = prisma.conversation.findUnique as ReturnType<typeof vi.fn>
const mockUpsertConvo = prisma.conversation.upsert as ReturnType<typeof vi.fn>
const mockSend = sendMessage as ReturnType<typeof vi.fn>
const mockRunAgent = runAgent as ReturnType<typeof vi.fn>

const PHONE = '+14045550199'
const TZ = 'America/New_York'
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000)
const OVER_A_DAY_AGO = new Date(Date.now() - HELD_TEXT_TTL_MS - 60_000)

// A one-user stand-in for the database, so claims behave like the real
// conditional update: they only land when the stage and held texts still match.
interface FakeUser {
  id: string
  timezone: string
  product: string | null
  onboarding: string | null
  onboardingHeld: string | null
}
let user: FakeUser
let convo: Array<{ role: string; content: unknown }> | null
let sent: string[]
let logged: Array<{ direction: string; body: string }>

function setUser(patch: Partial<FakeUser>) {
  user = { id: 'u1', timezone: TZ, product: null, onboarding: 'new', onboardingHeld: null, ...patch }
}

/** The stored form of held texts. */
function held(...entries: Array<[string, Date]>): string {
  return JSON.stringify(entries.map(([text, at]) => ({ text, at: at.toISOString() })))
}

/** The texts currently held on the fake user. */
function heldTexts(): string[] {
  return user.onboardingHeld ? (JSON.parse(user.onboardingHeld) as Array<{ text: string }>).map((e) => e.text) : []
}

/** The text the agent was handed on its nth call. */
function agentMessage(n = 0): string {
  return mockRunAgent.mock.calls[n][1]
}

beforeEach(() => {
  vi.clearAllMocks()
  setUser({})
  convo = null
  sent = []
  logged = []
  mockFindUser.mockImplementation(async () => ({ ...user }))
  mockUpdateMany.mockImplementation(async ({ where, data }) => {
    if (where.id !== user.id || where.onboarding !== user.onboarding || where.onboardingHeld !== user.onboardingHeld) {
      return { count: 0 }
    }
    Object.assign(user, data)
    return { count: 1 }
  })
  mockMessageCreate.mockImplementation(async ({ data }) => {
    logged.push({ direction: data.direction, body: data.body })
    return {}
  })
  mockFindConvo.mockImplementation(async () => (convo ? { messages: convo } : null))
  mockUpsertConvo.mockImplementation(async ({ update, create }) => {
    convo = (convo ? update.messages : create.messages) as typeof convo
    return {}
  })
  mockSend.mockImplementation(async (_phone: string, body: string) => {
    sent.push(body)
  })
  mockRunAgent.mockResolvedValue('AGENT REPLY')
})

describe('createUser', () => {
  it('starts a new number at the welcome, keeps the campaign source, and is one atomic upsert', async () => {
    mockUpsertUser.mockResolvedValue({ id: 'u1' })
    await createUser(PHONE, 'NSBE told me about this')
    expect(mockUpsertUser).toHaveBeenCalledWith({
      where: { phone: PHONE },
      create: { phone: PHONE, source: 'nsbe', onboarding: 'new' },
      // Non-empty, so Prisma uses INSERT … ON CONFLICT instead of read-then-insert
      update: { phone: PHONE },
    })
  })
})

describe('first text', () => {
  it('asks the question; a bare greeting holds nothing', async () => {
    expect(await runWelcome('u1', PHONE, 'hi')).toBe(true)
    expect(sent).toEqual(PICK_TEXTS)
    expect(user).toMatchObject({ onboarding: 'awaiting_product', onboardingHeld: null, product: null })
    expect(mockRunAgent).not.toHaveBeenCalled()
    expect(convo).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: PICK_TEXTS.join('\n\n') },
    ])
  })

  it('holds a request, with the time it was sent', async () => {
    const sentAt = minutesAgo(5)
    await runWelcome('u1', PHONE, 'can you help me stay organized', { sentAt })
    expect(sent).toEqual(PICK_TEXTS)
    expect(JSON.parse(user.onboardingHeld!)).toEqual([{ text: 'can you help me stay organized', at: sentAt.toISOString() }])
  })

  it('a seat watch picks SeatSnipe without asking: tip, then the school question last', async () => {
    expect(await runWelcome('u1', PHONE, 'WATCH CSC222')).toBe(true)
    expect(sent).toEqual([SEATSNIPE_WELCOME, DND_TIP, SCHOOL_QUESTION])
    expect(user).toMatchObject({ product: 'seatsnipe', onboarding: 'awaiting_school' })
    expect(heldTexts()).toEqual(['WATCH CSC222'])
    expect(mockRunAgent).not.toHaveBeenCalled()
    expect(convo).toEqual([
      { role: 'user', content: 'WATCH CSC222' },
      { role: 'assistant', content: [SEATSNIPE_WELCOME, DND_TIP, SCHOOL_QUESTION].join('\n\n') },
    ])
  })

  it('just "nudge" picks Nudge, with nothing more to answer', async () => {
    expect(await runWelcome('u1', PHONE, 'nudge')).toBe(true)
    expect(sent).toEqual([NUDGE_WELCOME, DND_TIP])
    expect(user).toMatchObject({ product: 'nudge', onboarding: null, onboardingHeld: null })
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('logs every text it sends', async () => {
    await runWelcome('u1', PHONE, 'WATCH CSC222')
    expect(logged).toEqual([SEATSNIPE_WELCOME, DND_TIP, SCHOOL_QUESTION].map((body) => ({ direction: 'out', body })))
  })

  it('a number created by START or STOP long ago still gets its first real text held fresh', async () => {
    // Held texts carry their own send time, whenever the row was made
    await runWelcome('u1', PHONE, 'WATCH CSC222')
    await runWelcome('u1', PHONE, 'GSU')
    expect(agentMessage()).toContain('WATCH CSC222')
  })
})

describe('answering the question', () => {
  const asked = (heldValue: string | null = held(['remind me about my bio quiz friday', minutesAgo(1)])) =>
    setUser({ onboarding: 'awaiting_product', onboardingHeld: heldValue })

  it('asks again, every time, until they pick', async () => {
    asked()
    expect(await runWelcome('u1', PHONE, 'ok')).toBe(true)
    expect(await runWelcome('u1', PHONE, '?')).toBe(true)
    expect(sent).toEqual([PICK_REASK, PICK_REASK])
    expect(user.onboarding).toBe('awaiting_product')
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('a request sent while being asked again is held too, and answered after the pick', async () => {
    asked(null)
    await runWelcome('u1', PHONE, 'can you help me out')
    expect(sent).toEqual([PICK_REASK])
    expect(heldTexts()).toEqual(['can you help me out'])
    await runWelcome('u1', PHONE, 'nudge')
    expect(agentMessage()).toContain('can you help me out')
  })

  it('Nudge: the welcome, then what they asked for gets answered', async () => {
    asked()
    expect(await runWelcome('u1', PHONE, 'nudge')).toBe(true)
    expect(sent).toEqual([NUDGE_WELCOME, DND_TIP, 'AGENT REPLY'])
    expect(user).toMatchObject({ product: 'nudge', onboarding: null, onboardingHeld: null })
    expect(mockRunAgent).toHaveBeenCalledOnce()
    expect(agentMessage()).toContain('picked Nudge')
    expect(agentMessage()).toContain('remind me about my bio quiz friday')
    expect(logged).toContainEqual({ direction: 'out', body: 'AGENT REPLY' })
  })

  it('a request typed with the pick is answered: "nudge, remind me …"', async () => {
    asked(null)
    await runWelcome('u1', PHONE, 'nudge, remind me about my calc exam friday 9am')
    expect(sent).toEqual([NUDGE_WELCOME, DND_TIP, 'AGENT REPLY'])
    expect(agentMessage()).toContain('remind me about my calc exam friday 9am')
  })

  it('"hey" then a request in a second bubble: the request picks Nudge and is answered', async () => {
    await runWelcome('u1', PHONE, 'hey')
    await runWelcome('u1', PHONE, 'can you remind me about my bio exam friday at 2')
    expect(sent).toEqual([...PICK_TEXTS, NUDGE_WELCOME, DND_TIP, 'AGENT REPLY'])
    expect(agentMessage()).toContain('can you remind me about my bio exam friday at 2')
  })

  it('"hey" then a reminder about watching something is Nudge, not SeatSnipe', async () => {
    await runWelcome('u1', PHONE, 'hey')
    await runWelcome('u1', PHONE, 'remind me to watch the lecture tonight at 8')
    expect(user.product).toBe('nudge')
    expect(agentMessage()).toContain('remind me to watch the lecture tonight at 8')
  })

  it('"hey" then a seat request: SeatSnipe, and the request waits for the school', async () => {
    await runWelcome('u1', PHONE, 'hey')
    await runWelcome('u1', PHONE, 'can you watch csc 1301 for me')
    expect(user).toMatchObject({ product: 'seatsnipe', onboarding: 'awaiting_school' })
    expect(heldTexts()).toEqual(['can you watch csc 1301 for me'])
    await runWelcome('u1', PHONE, 'GSU')
    expect(agentMessage()).toContain('can you watch csc 1301 for me')
  })

  it('Nudge after only greetings and the pick with filler: no extra reply, the welcome says what to do', async () => {
    await runWelcome('u1', PHONE, 'hi')
    await runWelcome('u1', PHONE, 'nudge thx')
    expect(sent).toEqual([...PICK_TEXTS, NUDGE_WELCOME, DND_TIP])
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('"the second one" picks Nudge and is not replayed as a request', async () => {
    asked(null)
    await runWelcome('u1', PHONE, 'the second one')
    expect(user.product).toBe('nudge')
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('each held text has its own send time, so "tomorrow" is read from the right day', async () => {
    asked(held(['hey i have a bio quiz coming up', new Date('2026-10-27T03:00:00Z')]))
    vi.useFakeTimers({ now: new Date('2026-10-27T12:00:00Z'), toFake: ['Date'] })
    await runWelcome('u1', PHONE, 'remind me about it tomorrow at 7am')
    vi.useRealTimers()
    const message = agentMessage()
    expect(message).toContain('(sent Mon, Oct 26, 11:00 PM) hey i have a bio quiz coming up')
    expect(message).toContain('(sent Tue, Oct 27, 8:00 AM) remind me about it tomorrow at 7am')
    expect(message).toContain('read "today", "tomorrow" and other relative times in it from then')
  })

  it('each held text expires on its own: a stale one is dropped, a fresh one kept', async () => {
    asked(held(['remind me about my quiz tomorrow', OVER_A_DAY_AGO], ['also my calc exam is thursday at 9am', minutesAgo(15)]))
    await runWelcome('u1', PHONE, 'nudge')
    expect(agentMessage()).toContain('also my calc exam is thursday at 9am')
    expect(agentMessage()).not.toContain('quiz tomorrow')
  })

  it('only stale held texts and a bare pick: not acted on', async () => {
    asked(held(['remind me about my quiz tomorrow', OVER_A_DAY_AGO]))
    await runWelcome('u1', PHONE, 'nudge')
    expect(sent).toEqual([NUDGE_WELCOME, DND_TIP])
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('SeatSnipe: the welcome ends on the school question, and the request stays held', async () => {
    asked(held(['can you help me get into my class', minutesAgo(1)]))
    await runWelcome('u1', PHONE, 'seatsnipe')
    expect(sent).toEqual([SEATSNIPE_WELCOME, DND_TIP, SCHOOL_QUESTION])
    expect(user).toMatchObject({ product: 'seatsnipe', onboarding: 'awaiting_school' })
    expect(heldTexts()).toEqual(['can you help me get into my class'])
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('both: SeatSnipe line, Nudge line, tip, then the school question', async () => {
    asked()
    await runWelcome('u1', PHONE, 'both')
    expect(sent).toEqual([SEATSNIPE_WELCOME, NUDGE_WELCOME, DND_TIP, SCHOOL_QUESTION])
    expect(user).toMatchObject({ product: 'both', onboarding: 'awaiting_school' })
  })

  it('a rejected side does not count: "Nudge, not seatsnipe" is Nudge', async () => {
    asked()
    await runWelcome('u1', PHONE, 'Nudge, not seatsnipe')
    expect(user.product).toBe('nudge')
  })

  it('a tapback on the question is ignored: no pick, no reply', async () => {
    asked()
    expect(await runWelcome('u1', PHONE, 'Liked “SeatSnipe or Nudge?”', { reaction: true })).toBe(true)
    expect(sent).toEqual([])
    expect(user).toMatchObject({ onboarding: 'awaiting_product', product: null })
  })

  it('keeps the whole exchange in the agent history, starting on their first text', async () => {
    convo = [
      { role: 'user', content: 'remind me about my bio quiz friday' },
      { role: 'assistant', content: PICK_TEXTS.join('\n\n') },
    ]
    asked()
    mockRunAgent.mockResolvedValue('')
    await runWelcome('u1', PHONE, 'nudge')
    expect(convo).toEqual([
      { role: 'user', content: 'remind me about my bio quiz friday' },
      { role: 'assistant', content: PICK_TEXTS.join('\n\n') },
      { role: 'user', content: 'nudge' },
      { role: 'assistant', content: [NUDGE_WELCOME, DND_TIP].join('\n\n') },
    ])
  })
})

describe('answering the school question', () => {
  const askedSchool = (patch: Partial<FakeUser> = {}) =>
    setUser({ product: 'seatsnipe', onboarding: 'awaiting_school', onboardingHeld: held(['WATCH CSC222', minutesAgo(1)]), ...patch })

  it('clears the welcome and has the agent save the school, then answer the held request', async () => {
    askedSchool()
    expect(await runWelcome('u1', PHONE, 'Georgia State')).toBe(true)
    expect(user).toMatchObject({ onboarding: null, onboardingHeld: null, product: 'seatsnipe' })
    expect(sent).toEqual(['AGENT REPLY'])
    expect(agentMessage().startsWith('Georgia State')).toBe(true)
    expect(agentMessage()).toContain('set_school')
    expect(agentMessage()).toContain('WATCH CSC222')
  })

  it('only once: the next text goes to the agent as usual', async () => {
    askedSchool()
    await runWelcome('u1', PHONE, 'Georgia State')
    expect(await runWelcome('u1', PHONE, 'the second one')).toBe(false)
  })

  it('a stale held request is left out; the agent asks for a class instead', async () => {
    askedSchool({ onboardingHeld: held(['watch csc 1301', OVER_A_DAY_AGO]) })
    await runWelcome('u1', PHONE, 'GSU')
    expect(agentMessage()).not.toContain('csc 1301')
    expect(agentMessage()).toContain('ask what class they need a seat in.')
  })

  it('a tapback on the school question is ignored, so their typed answer still counts', async () => {
    askedSchool()
    await runWelcome('u1', PHONE, 'Liked “What school do you go to?”', { reaction: true })
    expect(user.onboarding).toBe('awaiting_school')
    expect(mockRunAgent).not.toHaveBeenCalled()
  })

  it('passes lateReply through for texts the worker replays', async () => {
    askedSchool()
    await runWelcome('u1', PHONE, 'GSU', { lateReply: true })
    expect(mockRunAgent).toHaveBeenCalledWith('u1', expect.any(String), { lateReply: true })
  })
})

describe('schoolReplyMessage', () => {
  const heldText = { entries: [{ text: 'remind me about my calc quiz friday', at: new Date().toISOString() }], timezone: TZ }

  it('only a seat watch waits on a live school; reminders are handled even after a coming-soon reply', () => {
    const m = schoolReplyMessage('Kennesaw', 'both', heldText)
    expect(m).toContain("If set_school returns comingSoon, send its message as written and don't set up a watch.")
    expect(m).toContain('set up a seat watch only once set_school succeeds, but handle reminders, assignments and questions right away')
    expect(m).toContain('remind me about my calc quiz friday')
  })

  it('names the live schools so a loose spelling maps to the official name', () => {
    expect(schoolReplyMessage('ga state', 'seatsnipe', null)).toContain('SeatSnipe is live at: Georgia State University (GSU).')
  })

  it('tells the agent not to save a non-school as the school', () => {
    expect(schoolReplyMessage('why do you need that', 'seatsnipe', null)).toContain("If the reply doesn't name a school, don't call set_school")
  })

  it('both: asks for a class or what is due when nothing is held', () => {
    expect(schoolReplyMessage('GSU', 'both', null)).toContain('ask what class they need a seat in or what they have due.')
  })
})

describe('done or racing', () => {
  it('a user past the welcome goes straight to the agent', async () => {
    setUser({ onboarding: null, product: 'nudge' })
    expect(await runWelcome('u1', PHONE, 'hi')).toBe(false)
    expect(sent).toEqual([])
  })

  it('if another text claimed the step first, acts on where the welcome is now', async () => {
    // This text read the user while it was still 'new', but a quicker first
    // text already asked the question; "seatsnipe" is then their answer
    setUser({ onboarding: 'awaiting_product' })
    mockFindUser.mockImplementationOnce(async () => ({ ...user, onboarding: 'new' }))
    expect(await runWelcome('u1', PHONE, 'seatsnipe')).toBe(true)
    expect(sent).toEqual([SEATSNIPE_WELCOME, DND_TIP, SCHOOL_QUESTION])
    expect(user).toMatchObject({ product: 'seatsnipe', onboarding: 'awaiting_school' })
  })

  it('never overwrites a request another text held a moment earlier', async () => {
    // Read before a quicker text held its request; the pick must not drop it
    setUser({ onboarding: 'awaiting_product', onboardingHeld: held(['my quiz is friday', new Date()]) })
    mockFindUser.mockImplementationOnce(async () => ({ ...user, onboardingHeld: null }))
    await runWelcome('u1', PHONE, 'nudge')
    expect(agentMessage()).toContain('my quiz is friday')
  })

  it('a text that lost the first-text race to an auto-picked watch is not taken as the school answer', async () => {
    // "hey" read the user as 'new', but "WATCH CSC222" auto-picked SeatSnipe first
    setUser({ product: 'seatsnipe', onboarding: 'awaiting_school', onboardingHeld: held(['WATCH CSC222', new Date()]) })
    mockFindUser.mockImplementationOnce(async () => ({ ...user, onboarding: 'new', onboardingHeld: null, product: null }))
    expect(await runWelcome('u1', PHONE, 'hey')).toBe(true)
    expect(sent).toEqual([])
    expect(mockRunAgent).not.toHaveBeenCalled()
    expect(user.onboarding).toBe('awaiting_school')
    // Their real answer still finishes it, with the watch request
    await runWelcome('u1', PHONE, 'GSU')
    expect(agentMessage()).toContain('WATCH CSC222')
  })

  it('never re-asks after a pick that landed first; the text goes to the agent instead', async () => {
    // "ok" read the user as awaiting_product, but "nudge" finished the welcome first
    setUser({ onboarding: null, product: 'nudge' })
    mockFindUser.mockImplementationOnce(async () => ({ ...user, onboarding: 'awaiting_product', product: null }))
    expect(await runWelcome('u1', PHONE, 'ok')).toBe(false)
    expect(sent).toEqual([])
  })
})

describe('photos', () => {
  it("a new number's photo counts as Nudge", async () => {
    expect(await welcomeForPhoto('u1', PHONE)).toBeNull()
    expect(sent).toEqual([NUDGE_WELCOME, DND_TIP])
    expect(user).toMatchObject({ product: 'nudge', onboarding: null })
  })

  it('after the question, hands back what they asked for', async () => {
    const at = minutesAgo(1)
    setUser({ onboarding: 'awaiting_product', onboardingHeld: held(['can you track my bio class', at]) })
    expect(await welcomeForPhoto('u1', PHONE)).toEqual({ entries: [{ text: 'can you track my bio class', at: at.toISOString() }], timezone: TZ })
    expect(user).toMatchObject({ product: 'nudge', onboarding: null, onboardingHeld: null })
  })

  it('re-reads after losing a race to a text, instead of skipping the welcome', async () => {
    setUser({ onboarding: 'awaiting_product' })
    mockFindUser.mockImplementationOnce(async () => ({ ...user, onboarding: 'new' }))
    await welcomeForPhoto('u1', PHONE)
    expect(sent).toEqual([NUDGE_WELCOME, DND_TIP])
    expect(user).toMatchObject({ product: 'nudge', onboarding: null })
  })

  it('does nothing once they are past the pick', async () => {
    setUser({ product: 'seatsnipe', onboarding: 'awaiting_school', onboardingHeld: held(['hi there friend', new Date()]) })
    expect(await welcomeForPhoto('u1', PHONE)).toBeNull()
    expect(sent).toEqual([])
    expect(user.onboarding).toBe('awaiting_school')
  })

  it('a photo that cannot be read still gets the held request answered', async () => {
    await replayHeldText('u1', PHONE, { entries: [{ text: 'my bio quiz is friday', at: new Date().toISOString() }], timezone: TZ })
    expect(agentMessage()).toContain('my bio quiz is friday')
    expect(sent).toEqual(['AGENT REPLY'])
  })

  it('a photo that can be read mentions the held request in its note', () => {
    const note = heldTextNote({ entries: [{ text: 'my bio quiz is friday', at: new Date().toISOString() }], timezone: TZ })
    expect(note).toContain('Before the photo they also texted the lines below')
    expect(note).toContain('my bio quiz is friday')
  })
})
