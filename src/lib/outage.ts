import Anthropic from '@anthropic-ai/sdk'
import { redis } from './redis'
import { prisma } from './prisma'
import { sendMessage } from './bluebubbles'

// Outage flow:
// 1. Any server/API failure while handling a user (agent error, Anthropic credits out, etc.)
//    → handleServerFailure(): mark outage in Redis, text the user ONCE that servers are down,
//    remember who was told (Redis set), and text the admin.
// 2. The worker (always-on Mac) runs startOutageMonitor(): while the outage flag is set, it
//    health-checks the DB + Anthropic every minute.
// 3. When healthy again → text everyone who got the down message that Nudge is back, then clear state.
//
// State lives in Redis because failures can happen on Vercel (webhook) while recovery
// detection + comeback messages happen on the Mac worker.

const OUTAGE_KEY = 'nudge:outage'
const NOTIFIED_KEY = 'nudge:outage:notified'

export const DOWN_MESSAGE =
  "hey, my servers are currently down 😔 i'll nudge you as soon as they're back up!"
export const RECOVERY_MESSAGE = "ok i'm back! what did you want me to remind you about?"

/** Mark an outage as active. Returns true only for the call that started it. */
export async function markOutage(reason: string): Promise<boolean> {
  const created = await redis.set(
    OUTAGE_KEY,
    JSON.stringify({ since: new Date().toISOString(), reason: reason.slice(0, 300) }),
    'NX'
  )
  return created === 'OK'
}

export async function isOutageActive(): Promise<boolean> {
  return (await redis.exists(OUTAGE_KEY)) === 1
}

/** Forget that a user was told about the outage (e.g. the agent just replied to them fine). */
export async function clearNotified(userId: string): Promise<void> {
  try {
    await redis.srem(NOTIFIED_KEY, userId)
  } catch {
    // best-effort
  }
}

async function notifyAdmin(text: string): Promise<void> {
  const adminPhone = process.env.ADMIN_PHONE
  if (!adminPhone) return
  try {
    await sendMessage(adminPhone, text)
  } catch {
    // best-effort — admin alert must never break the flow
  }
}

async function appendAssistantMessage(userId: string, message: string): Promise<void> {
  try {
    const existing = await prisma.conversation.findUnique({ where: { userId } })
    const messages = [...((existing?.messages ?? []) as object[]), { role: 'assistant', content: message }]
    await prisma.conversation.upsert({
      where: { userId },
      update: { messages },
      create: { userId, messages },
    })
  } catch {
    // conversation context is nice-to-have
  }
}

/**
 * Call from any catch block where a user's message couldn't be handled because of a
 * server/API failure. Sends the "servers are down" text once per user per outage.
 */
export async function handleServerFailure(userId: string, phone: string, err: unknown): Promise<void> {
  const reason = err instanceof Error ? err.message : String(err)
  let firstTime = true
  let startedOutage = false

  try {
    startedOutage = await markOutage(reason)
    // SADD returns 1 only the first time — atomic dedupe across concurrent webhooks
    firstTime = (await redis.sadd(NOTIFIED_KEY, userId)) === 1
  } catch (e) {
    // Redis unreachable — still try to tell the user (may double-text, better than silence)
    console.error('[outage] redis unavailable while recording outage:', e instanceof Error ? e.message : String(e))
  }

  if (startedOutage) {
    console.error(`[outage] Outage started: ${reason.slice(0, 200)}`)
    void notifyAdmin(`[Nudge] 🔴 Server outage detected: ${reason.slice(0, 200)}`)
  }

  if (firstTime) {
    try {
      await sendMessage(phone, DOWN_MESSAGE)
      await prisma.message.create({ data: { userId, direction: 'out', body: DOWN_MESSAGE } })
      await appendAssistantMessage(userId, DOWN_MESSAGE)
    } catch (e) {
      console.error('[outage] failed to send down message:', e instanceof Error ? e.message : String(e))
    }
  }
}

const anthropic = new Anthropic()

/** Healthy = DB reachable AND the Anthropic API accepts a (1-token) request. */
async function healthCheck(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    })
    return true
  } catch {
    return false
  }
}

/**
 * Run on the always-on worker. While an outage is flagged, health-check every
 * `intervalMs`; on recovery, send the comeback message to every user who was
 * told we were down, then clear the outage state.
 */
export function startOutageMonitor(intervalMs = 60_000): void {
  let running = false

  setInterval(async () => {
    if (running) return
    running = true
    try {
      if (!(await isOutageActive())) return
      if (!(await healthCheck())) return

      const userIds = await redis.smembers(NOTIFIED_KEY)
      let sentCount = 0

      for (const userId of userIds) {
        try {
          const user = await prisma.user.findUnique({ where: { id: userId } })
          if (user && !user.optedOut) {
            await sendMessage(user.phone, RECOVERY_MESSAGE)
            await prisma.message.create({ data: { userId, direction: 'out', body: RECOVERY_MESSAGE } })
            await appendAssistantMessage(userId, RECOVERY_MESSAGE)
            sentCount++
          }
          await redis.srem(NOTIFIED_KEY, userId)
          await new Promise((r) => setTimeout(r, 300))
        } catch (err) {
          // Leave this user in the set — retried on the next tick
          console.error(`[outage] failed to send recovery message to user ${userId}:`, err instanceof Error ? err.message : String(err))
        }
      }

      // Only close the outage once everyone has been messaged
      const remaining = await redis.scard(NOTIFIED_KEY)
      if (remaining === 0) {
        await redis.del(OUTAGE_KEY)
        console.log(`[outage] Recovered — sent ${sentCount} comeback message(s)`)
        void notifyAdmin(`[Nudge] 🟢 Back online — comeback message sent to ${sentCount} user(s).`)
      }
    } catch (err) {
      console.error('[outage] monitor tick failed:', err instanceof Error ? err.message : String(err))
    } finally {
      running = false
    }
  }, intervalMs)

  console.log('[outage] Outage monitor started')
}
