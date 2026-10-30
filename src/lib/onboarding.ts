import { prisma } from './prisma'
import { sendMessage, sendTypingIndicator } from './bluebubbles'
import { runAgent } from './agent'
import { clearNotified } from './outage'
import { liveSchools } from './schools'
import {
  PICK_TEXTS,
  PICK_REASK,
  welcomeTexts,
  pickFromAnswer,
  pickFromFirstText,
  hasSomethingToAnswer,
  type Product,
} from './pick'

// The welcome a new number goes through before anything else:
//   'new'               first text → "SeatSnipe or Nudge?" (or an auto-pick)
//   'awaiting_product'  their answer → the welcome for that pick, asked again until they pick
//   'awaiting_school'   picked SeatSnipe → their school, then what they asked for
// Anything they ask for before or with their pick is held, each text with its
// send time, and answered once they've picked. Shared by the webhook and the
// worker's missed-message replay.

type Stage = 'new' | 'awaiting_product' | 'awaiting_school'

/** A held text older than this is too old to act on. */
export const HELD_TEXT_TTL_MS = 24 * 60 * 60 * 1000

// Keep in step with runAgent, which trims history the same way
const MAX_HISTORY = 20

const CAMPAIGN_SOURCES = ['nsbe', 'gdg', 'reddit', 'colorstack']

/** Creates the user for a number we've never seen; their first text starts the welcome. */
export async function createUser(phone: string, firstText: string) {
  const lower = firstText.toLowerCase()
  const source = CAMPAIGN_SOURCES.find((kw) => lower.includes(kw)) ?? null
  // A non-empty update makes Prisma run one INSERT … ON CONFLICT, so two quick
  // first texts from a new number can't both insert and crash on the unique
  // phone. With update: {} it reads, then inserts. It never changes the row.
  return prisma.user.upsert({
    where: { phone },
    create: { phone, source, onboarding: 'new' },
    update: { phone },
  })
}

/** One held text and when it was sent (ISO). */
interface HeldEntry {
  text: string
  at: string
}

/** What they asked for before or with their pick, still to be answered. */
export interface HeldText {
  entries: HeldEntry[]
  timezone: string
}

export interface WelcomeOptions {
  /** The worker's replay of a text missed while the webhook was down */
  lateReply?: boolean
  /** When the text was sent, if not just now (the worker passes BlueBubbles' time) */
  sentAt?: Date
  /** A tapback (Liked “…”); never an answer, and not worth a reply */
  reaction?: boolean
}

interface WelcomeUser {
  id: string
  timezone: string
  product: string | null
  onboarding: string | null
  onboardingHeld: string | null
}

const WELCOME_SELECT = { id: true, timezone: true, product: true, onboarding: true, onboardingHeld: true } as const

/**
 * Runs a text through the welcome. Returns true when the welcome handled it,
 * false when it should go on to the agent as usual.
 */
export async function runWelcome(
  userId: string,
  phone: string,
  text: string,
  opts: WelcomeOptions = {}
): Promise<boolean> {
  // Each step claims its move with a conditional update. If another text got
  // there first, re-read the user and act on where the welcome is now.
  let readIn: string | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: WELCOME_SELECT })
    if (!user?.onboarding) return false
    if (opts.reaction) return true
    readIn ??= user.onboarding
    const handled = await step(user, phone, text, readIn, opts)
    if (handled !== null) return handled
  }
  return false
}

/** One move of the welcome. Null when another text changed it first. */
async function step(
  user: WelcomeUser,
  phone: string,
  text: string,
  readIn: string,
  opts: WelcomeOptions
): Promise<boolean | null> {
  const held = freshEntries(parseHeld(user.onboardingHeld))
  const withThis = hasSomethingToAnswer(text) ? [...held, { text, at: (opts.sentAt ?? new Date()).toISOString() }] : held

  switch (user.onboarding) {
    case 'new': {
      const pick = pickFromFirstText(text)
      if (pick) {
        if (!(await claim(user, afterPick(pick, withThis)))) return null
        await sendWelcome(user.id, phone, pick, text)
        if (pick === 'nudge') await answerHeld(user, phone, withThis, opts)
        return true
      }
      if (!(await claim(user, { onboarding: 'awaiting_product', onboardingHeld: serializeHeld(withThis) }))) return null
      await say(user.id, phone, PICK_TEXTS)
      await remember(user.id, text, PICK_TEXTS.join('\n\n'))
      return true
    }

    case 'awaiting_product': {
      const pick = pickFromAnswer(text)
      if (!pick) {
        // Not a pick: hold anything it asks for, then ask again. The claim also
        // catches a pick that landed first, so this never re-asks after a welcome.
        if (!(await claim(user, { onboarding: 'awaiting_product', onboardingHeld: serializeHeld(withThis) }))) return null
        await say(user.id, phone, [PICK_REASK])
        await remember(user.id, text, PICK_REASK)
        return true
      }
      if (!(await claim(user, afterPick(pick, withThis)))) return null
      await sendWelcome(user.id, phone, pick, text)
      if (pick === 'nudge') await answerHeld(user, phone, withThis, opts)
      return true
    }

    case 'awaiting_school': {
      if (readIn !== 'awaiting_school') {
        // Sent before the school question went out (it lost a race to the pick),
        // so it isn't their answer: hold anything it asks for and keep waiting
        if (!(await claim(user, { onboarding: 'awaiting_school', onboardingHeld: serializeHeld(withThis) }))) return null
        return true
      }
      if (!(await claim(user, { onboarding: null, onboardingHeld: null }))) return null
      const product: Product = user.product === 'both' ? 'both' : 'seatsnipe'
      const heldText = held.length ? { entries: held, timezone: user.timezone } : null
      await agentReply(user.id, phone, schoolReplyMessage(text, product, heldText), opts)
      return true
    }

    default:
      // An unknown stage would otherwise trap them; let the agent take it
      return false
  }
}

/**
 * A photo before they've picked counts as Nudge: sends the Nudge welcome.
 * Returns what they'd asked for before the photo, still to be answered.
 */
export async function welcomeForPhoto(userId: string, phone: string): Promise<HeldText | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: WELCOME_SELECT })
    if (!user || (user.onboarding !== 'new' && user.onboarding !== 'awaiting_product')) return null
    if (!(await claim(user, afterPick('nudge', [])))) continue
    await say(user.id, phone, welcomeTexts('nudge'))
    const held = freshEntries(parseHeld(user.onboardingHeld))
    return held.length ? { entries: held, timezone: user.timezone } : null
  }
  return null
}

/** After a Nudge pick (or a photo that couldn't be read), what they asked for gets its answer. */
export async function replayHeldText(userId: string, phone: string, held: HeldText, opts: WelcomeOptions = {}) {
  const message = `[New student. They picked Nudge in the welcome and were just sent the Nudge intro and the Do Not Disturb tip. Below is what they asked for before or with their pick. Reply to it now. ${READ_TIMES}]\n${formatHeld(held)}`
  await agentReply(userId, phone, message, opts)
}

/** For the photo flow: the held texts, worded for the agent's note about the photo. */
export function heldTextNote(held: HeldText): string {
  return ` Before the photo they also texted the lines below; answer those too. ${READ_TIMES}\n${formatHeld(held)}\n`
}

/**
 * Their reply to "What school do you go to?", with what the agent needs to
 * finish the welcome. Self-contained, since the agent forgets after 30 quiet minutes.
 */
export function schoolReplyMessage(reply: string, product: Product, held: HeldText | null): string {
  const side = product === 'both' ? 'SeatSnipe and Nudge' : 'SeatSnipe'
  const schools = liveSchools()
    .map((s) => `${s.name} (${s.shortName})`)
    .join(', ')
  // Only a seat watch needs a live school; reminders and questions never wait on it
  const then = held
    ? `Then handle what they asked for before the school question (below) as if they had just sent it: set up a seat watch only once set_school succeeds, but handle reminders, assignments and questions right away, even after a coming-soon message or a reply that isn't a school. ${READ_TIMES}\n${formatHeld(held)}`
    : product === 'both'
      ? 'Once set_school succeeds, ask what class they need a seat in or what they have due.'
      : 'Once set_school succeeds, ask what class they need a seat in.'
  return `${reply}\n\n[New student. They picked ${side} in the welcome and were asked "What school do you go to?". The text above is their reply. SeatSnipe is live at: ${schools}. If the reply names a school, call set_school with it, using the official name when it clearly means one of those. If set_school returns comingSoon, send its message as written and don't set up a watch. If the reply doesn't name a school, don't call set_school, just respond to it. ${then}]`
}

const READ_TIMES =
  'Each line starts with when it was sent, in their time: read "today", "tomorrow" and other relative times in it from then, and if a time it mentions has already passed, say so instead of setting it.'

function formatHeld(held: HeldText): string {
  return held.entries.map((e) => `(sent ${formatTime(new Date(e.at), held.timezone)}) ${e.text}`).join('\n')
}

function formatTime(at: Date, timezone: string): string {
  const options = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } as const
  try {
    return at.toLocaleString('en-US', { ...options, timeZone: timezone })
  } catch {
    return at.toLocaleString('en-US', { ...options, timeZone: 'America/New_York' })
  }
}

type WelcomeUpdate = { product?: Product; onboarding: Stage | null; onboardingHeld: string | null }

function afterPick(pick: Product, held: HeldEntry[]): WelcomeUpdate {
  return pick === 'nudge'
    ? { product: pick, onboarding: null, onboardingHeld: null }
    : { product: pick, onboarding: 'awaiting_school', onboardingHeld: serializeHeld(held) }
}

/**
 * Lands an update only if the welcome is still where this text read it, held
 * texts included, so a quicker text's change is never overwritten.
 */
async function claim(user: WelcomeUser, data: WelcomeUpdate): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: { id: user.id, onboarding: user.onboarding, onboardingHeld: user.onboardingHeld },
    data,
  })
  return count === 1
}

function parseHeld(raw: string | null): HeldEntry[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((e): e is HeldEntry => typeof e?.text === 'string' && typeof e?.at === 'string')
      : []
  } catch {
    return []
  }
}

/** Each held text expires on its own, a day after it was sent. */
function freshEntries(entries: HeldEntry[]): HeldEntry[] {
  return entries.filter((e) => Date.now() - Date.parse(e.at) < HELD_TEXT_TTL_MS)
}

function serializeHeld(entries: HeldEntry[]): string | null {
  return entries.length ? JSON.stringify(entries) : null
}

async function answerHeld(user: WelcomeUser, phone: string, entries: HeldEntry[], opts: WelcomeOptions) {
  if (entries.length) await replayHeldText(user.id, phone, { entries, timezone: user.timezone }, opts)
}

async function sendWelcome(userId: string, phone: string, pick: Product, userText: string): Promise<void> {
  const texts = welcomeTexts(pick)
  await say(userId, phone, texts)
  await remember(userId, userText, texts.join('\n\n'))
}

async function agentReply(userId: string, phone: string, message: string, opts: WelcomeOptions) {
  void sendTypingIndicator(phone)
  const reply = await runAgent(userId, message, { lateReply: opts.lateReply })
  if (reply) {
    await sendMessage(phone, reply)
    await prisma.message.create({ data: { userId, direction: 'out', body: reply } })
  }
  // Agent worked for this user — don't send them a redundant "i'm back" later
  void clearNotified(userId)
}

async function say(userId: string, phone: string, texts: string[]): Promise<void> {
  for (const body of texts) {
    await sendMessage(phone, body)
    await prisma.message.create({ data: { userId, direction: 'out', body } })
  }
}

/** Adds an exchange to the agent's history, so it knows the welcome happened. */
async function remember(userId: string, userText: string, assistantText: string): Promise<void> {
  const convo = await prisma.conversation.findUnique({ where: { userId } })
  const prior = (convo?.messages ?? []) as Array<{ role: string; content: unknown }>
  let messages = [...prior, { role: 'user', content: userText }, { role: 'assistant', content: assistantText }]
  // Same trim as the agent: keep the last few, never starting on an assistant
  // turn or on tool results whose tool call was cut off
  if (messages.length > MAX_HISTORY) {
    messages = messages.slice(-MAX_HISTORY)
    while (messages.length && (messages[0].role !== 'user' || isToolResult(messages[0].content))) {
      messages = messages.slice(1)
    }
  }
  await prisma.conversation.upsert({
    where: { userId },
    update: { messages: messages as object[] },
    create: { userId, messages: messages as object[] },
  })
}

function isToolResult(content: unknown): boolean {
  return Array.isArray(content) && content.some((b) => (b as { type?: string })?.type === 'tool_result')
}
