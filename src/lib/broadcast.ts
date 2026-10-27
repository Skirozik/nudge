import type { Prisma } from '@/generated/prisma/client'
import { prisma } from './prisma'
import { redis } from './redis'
import { scheduleBroadcast } from './queue'

/** Students who have used SeatSnipe: they've had a watch or picked a school. Nudge-only users are left out. */
export const SEATSNIPE_AUDIENCE = {
  optedOut: false,
  OR: [{ watches: { some: {} } }, { school: { not: null } }],
} satisfies Prisma.UserWhereInput

const PENDING_KEY = 'nudge:broadcast:seatsnipe:pending'
export const PENDING_TTL_SECONDS = 10 * 60
// Spread the texts out so a mass send doesn't look like spam to Apple
export const SEND_SPACING_MS = 2_000

/**
 * "BROADCAST SEATSNIPE <message>" (any case, optional colon) → the message.
 * Returns '' when the message is missing, so the caller can refuse instead of
 * letting it fall through to the everyone-broadcast. Null for any other text.
 */
export function parseSeatSnipeBroadcast(text: string): string | null {
  const m = text.trim().match(/^broadcast\s+seatsnipe\b:?([\s\S]*)$/i)
  return m ? m[1].trim() : null
}

/** Holds the message for PENDING_TTL_SECONDS until the admin replies SEND. Returns how many students it would reach. */
export async function stageSeatSnipeBroadcast(message: string): Promise<number> {
  await redis.set(PENDING_KEY, message, 'EX', PENDING_TTL_SECONDS)
  return prisma.user.count({ where: SEATSNIPE_AUDIENCE })
}

/** Queues the staged message for every SeatSnipe student. Null when nothing is staged (or it expired). */
export async function sendStagedSeatSnipeBroadcast(): Promise<number | null> {
  // GETDEL so a duplicate SEND can't queue it twice
  const message = await redis.getdel(PENDING_KEY)
  if (!message) return null
  const recipients = await prisma.user.findMany({ where: SEATSNIPE_AUDIENCE, select: { id: true, phone: true } })
  await Promise.all(recipients.map((u, i) => scheduleBroadcast(u.id, u.phone, message, i * SEND_SPACING_MS)))
  return recipients.length
}
