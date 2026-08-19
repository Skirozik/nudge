import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendMessage } from '@/lib/bluebubbles'
import { redis } from '@/lib/redis'
import { scheduleFollowUp } from '@/lib/queue'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate-limit: 10 requests per 5 min per token using Redis INCR (works across Vercel instances)
  const rateKey = `nudge:loc-rate:${token}`
  try {
    const count = await redis.incr(rateKey)
    if (count === 1) await redis.expire(rateKey, 300)
    if (count > 10) return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 })
  } catch {
    // Redis hiccup — let it through rather than block legitimate triggers
  }

  const user = await prisma.user.findUnique({ where: { locationToken: token } })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (user.optedOut) return NextResponse.json({ fired: 0 })

  let body: { location?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const location = (body.location ?? '').toLowerCase().trim()
  if (!location) return NextResponse.json({ error: 'location is required' }, { status: 400 })

  const reminders = await prisma.locationReminder.findMany({
    where: { userId: user.id, location, active: true },
  })

  const now = new Date()
  let fired = 0

  for (const reminder of reminders) {
    // Cooldown guard — skip if fired too recently (protects against geofence flapping)
    if (reminder.lastFiredAt) {
      const msSinceLast = now.getTime() - reminder.lastFiredAt.getTime()
      if (msSinceLast < reminder.cooldownMinutes * 60_000) continue
    }

    // Mark BEFORE sending; capture previous state for rollback on failure
    const prevLastFiredAt = reminder.lastFiredAt
    if (reminder.recurring) {
      await prisma.locationReminder.update({
        where: { id: reminder.id },
        data: { lastFiredAt: now },
      })
    } else {
      await prisma.locationReminder.update({
        where: { id: reminder.id },
        data: { active: false },
      })
    }

    try {
      await sendMessage(user.phone, reminder.message)
    } catch (err) {
      // Revert so the reminder isn't consumed on a send failure
      if (reminder.recurring) {
        await prisma.locationReminder.update({
          where: { id: reminder.id },
          data: { lastFiredAt: prevLastFiredAt },
        })
      } else {
        await prisma.locationReminder.update({
          where: { id: reminder.id },
          data: { active: true },
        })
      }
      console.error('[location-trigger] sendMessage failed, reverted:', err instanceof Error ? err.message : String(err))
      continue
    }

    // Log outbound Message row
    await prisma.message.create({
      data: { userId: user.id, direction: 'out', body: reminder.message },
    })

    // Append to Conversation JSON so agent has context when user replies
    const convo = await prisma.conversation.findUnique({ where: { userId: user.id } })
    if (convo) {
      const msgs = (convo.messages as Array<{ role: string; content: unknown }>) ?? []
      const updated = [
        ...msgs,
        { role: 'assistant', content: `(location trigger fired: ${reminder.message})` },
      ]
      await prisma.conversation.update({
        where: { userId: user.id },
        data: { messages: updated as object[] },
      })
    }

    // Wire into escalation nag flow if persistent
    if (reminder.persistent) {
      await scheduleFollowUp({
        userId: user.id,
        oneOffMessage: reminder.message,
        followUpNumber: 0,
        sentAfter: now.toISOString(),
      })
    }

    fired++
  }

  return NextResponse.json({ fired })
}
