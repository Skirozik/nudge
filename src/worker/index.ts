import 'dotenv/config'
import { Worker } from 'bullmq'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../lib/prisma'
import { sendMessage } from '../lib/bluebubbles'
import { runAgent } from '../lib/agent'
import { reminderQueue, enqueueReminder, scheduleFollowUp, scheduleCheckIn, scheduleSeatAlert } from '../lib/queue'
import { normalizePhone } from '../lib/phone'
import { startWatcherLoop } from '../lib/watcher'
import { applyDiff, logMetric } from '../lib/watches'
import { searchByCrn } from '../lib/banner'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

const workerConnection = { url: REDIS_URL, maxRetriesPerRequest: null as null }

const anthropic = new Anthropic()

const PERSONA_PROMPTS: Record<string, string> = {
  coach:
    "You are Nudge, a warm study buddy sending a reminder text. Sound like a real friend texting, not an app notification. 1-2 sentences, plain text, no em dashes, no markdown.",
  snarky:
    "You are Nudge, a snarky friend sending a reminder. Dry, brief, real. 1-2 sentences, plain text, no em dashes, no markdown.",
  anxious:
    "You are Nudge, an anxious study buddy sending a reminder. Caring, a little flustered, real. 1-2 sentences, plain text, no em dashes, no markdown.",
}

const NAG_ESCALATION = [
  "Mild follow-up — they probably just missed it. Casually check in. 'hey did you see my last text?' energy.",
  "They definitely saw it and are ignoring you. Call them out, a little annoyed but still cute about it.",
  "Full naggy mode. You cannot believe they are still not responding. Short, punchy, dramatic.",
  "You are personally offended. Make it funny but absolutely relentless. Maybe use their assignment name directly.",
  "Final text. Make it count. Full drama queen. This is your last one and you want them to FEEL that.",
]

async function appendToConversation(userId: string, message: string): Promise<void> {
  const existing = await prisma.conversation.findUnique({ where: { userId } })
  const messages = [...((existing?.messages ?? []) as object[]), { role: 'assistant', content: message }]
  await prisma.conversation.upsert({
    where: { userId },
    update: { messages },
    create: { userId, messages },
  })
}

async function generateReminderMessage(
  title: string,
  course: string | null,
  dueAt: Date,
  persona: string
): Promise<string> {
  const msLeft = dueAt.getTime() - Date.now()
  const hoursLeft = Math.round(msLeft / (1000 * 60 * 60))
  const timeStr =
    hoursLeft <= 0 ? 'very soon' : `in about ${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}`

  const prompt = `Write a short reminder text message. Assignment: "${title}"${course ? ` for ${course}` : ''}. Due ${timeStr}.`

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 150,
    system: PERSONA_PROMPTS[persona] ?? PERSONA_PROMPTS.coach,
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlock = res.content.find((b) => b.type === 'text')
  return textBlock?.type === 'text'
    ? textBlock.text
    : `Reminder: "${title}" is due ${timeStr}!`
}

async function generateNagMessage(
  title: string,
  course: string | null,
  followUpNumber: number
): Promise<string> {
  const escalation = NAG_ESCALATION[followUpNumber] ?? NAG_ESCALATION[NAG_ESCALATION.length - 1]

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 120,
    system:
      "You are Nudge, texting like a naggy ex who genuinely cares but will NOT be ignored. Real iMessage energy. Lowercase fine, no em dashes, no markdown, max 2 sentences.",
    messages: [
      {
        role: 'user',
        content: `Write follow-up #${followUpNumber + 1} for assignment "${title}"${course ? ` (${course})` : ''}. Escalation: ${escalation}`,
      },
    ],
  })

  const textBlock = res.content.find((b) => b.type === 'text')
  return textBlock?.type === 'text' ? textBlock.text : `HEY. ${title}. Still waiting. 👀`
}

async function processReminder(assignmentId: string | undefined): Promise<void> {
  if (!assignmentId) {
    console.error('[worker] processReminder called with no assignmentId — skipping')
    return
  }

  const reminder = await prisma.reminder.findFirst({
    where: { assignmentId, sent: false },
    include: { assignment: { include: { user: true } } },
  })

  if (!reminder) return

  const { assignment } = reminder
  const { user } = assignment

  if (user.optedOut || assignment.status !== 'open') {
    await prisma.reminder.update({ where: { id: reminder.id }, data: { sent: true } })
    return
  }

  const message = await generateReminderMessage(
    assignment.title,
    assignment.course,
    assignment.dueAt,
    user.persona
  )

  const sentAt = new Date()
  await sendMessage(user.phone, message)

  await prisma.reminder.update({
    where: { id: reminder.id },
    data: { sent: true, sentAt },
  })

  await prisma.message.create({
    data: { userId: user.id, direction: 'out', body: message },
  })

  await appendToConversation(user.id, message)

  if (assignment.nudgeMode === 'persistent') {
    await scheduleFollowUp({
      assignmentId,
      userId: user.id,
      followUpNumber: 0,
      sentAfter: sentAt.toISOString(),
    })
  }
}

async function recoverMissedMessages(): Promise<void> {
  const url = process.env.BLUEBUBBLES_URL
  const password = process.env.BLUEBUBBLES_PASSWORD
  if (!url || !password) return

  // Look back at most 24 hours; use our most recent inbound message as the floor
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const lastSeen = await prisma.message.findFirst({
    where: { direction: 'in', createdAt: { gte: cutoff } },
    orderBy: { createdAt: 'desc' },
  })
  // Overlap by 2 min to catch any race between webhook and job
  const sinceMs = lastSeen
    ? lastSeen.createdAt.getTime() - 2 * 60 * 1000
    : cutoff.getTime()

  let messages: Array<{
    guid: string
    text?: string
    isFromMe: boolean
    dateCreated: number
    handle?: { address: string }
    chats?: Array<{ guid: string }>
  }>

  try {
    const res = await fetch(
      `${url}/api/v1/message/query?password=${encodeURIComponent(password)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50, sort: 'ASC', after: sinceMs, with: ['handle', 'chat'] }),
      }
    )
    if (!res.ok) {
      console.log(`[worker] BlueBubbles message query returned ${res.status} — skipping missed message recovery`)
      return
    }
    const json = await res.json()
    messages = json.data ?? []
  } catch {
    return // BlueBubbles still unreachable — skip quietly
  }

  const candidates = messages.filter(
    (m) =>
      !m.isFromMe &&
      m.text?.trim() &&
      !m.chats?.[0]?.guid?.includes(';+;')
  )

  if (candidates.length === 0) return
  console.log(`[worker] Checking ${candidates.length} recent BlueBubbles messages for missed ones...`)

  for (const m of candidates) {
    const phone = m.handle?.address
    if (!phone) continue
    const body = m.text!.trim()
    const msgTime = new Date(m.dateCreated)

    // Skip if we already have this message (processed via webhook)
    const alreadyHandled = await prisma.message.findFirst({
      where: {
        direction: 'in',
        body,
        user: { phone },
        createdAt: {
          gte: new Date(msgTime.getTime() - 2 * 60 * 1000),
          lte: new Date(msgTime.getTime() + 2 * 60 * 1000),
        },
      },
    })
    if (alreadyHandled) continue

    // Honor STOP/START keywords — do not replay through the agent
    const upper = body.toUpperCase()
    if (upper === 'STOP') {
      const normalized = normalizePhone(phone)
      await prisma.user.upsert({ where: { phone: normalized }, update: { optedOut: true }, create: { phone: normalized, optedOut: true } })
      continue
    }
    if (upper === 'START') {
      const normalized = normalizePhone(phone)
      await prisma.user.upsert({ where: { phone: normalized }, update: { optedOut: false }, create: { phone: normalized, optedOut: false } })
      try { await sendMessage(normalized, "You're back! I'm Nudge, your study buddy. What's due?") } catch {}
      continue
    }

    console.log(`[worker] Replaying missed message from ${phone}: "${body.slice(0, 60)}"`)

    const normalized = normalizePhone(phone)
    let user = await prisma.user.findUnique({ where: { phone: normalized } })
    if (user?.optedOut) continue
    if (!user) user = await prisma.user.create({ data: { phone: normalized } })

    await prisma.message.create({ data: { userId: user.id, direction: 'in', body } })

    try {
      const reply = await runAgent(user.id, body, { lateReply: true })
      if (reply) {
        await sendMessage(normalized, reply)
        await prisma.message.create({ data: { userId: user.id, direction: 'out', body: reply } })
      }
    } catch (err) {
      console.error(`[worker] Failed to replay missed message from ${normalized}:`, err)
    }

    await new Promise((r) => setTimeout(r, 500))
  }
}

async function recoverOnStartup(): Promise<void> {
  console.log('[worker] Running startup recovery...')

  const missed = await prisma.reminder.findMany({
    where: { sent: false, sendAt: { lte: new Date() } },
    include: { assignment: { include: { user: true } } },
  })

  for (const reminder of missed) {
    if (reminder.assignment.status === 'open' && !reminder.assignment.user.optedOut) {
      if (!reminder.bullmqJobId) {
        // Job was never created — manually send to avoid racing BullMQ-promoted jobs
        console.log(`[worker] Sending missed reminder for ${reminder.assignmentId} (no BullMQ job)`)
        try {
          await processReminder(reminder.assignmentId)
        } catch (e) {
          console.error('[worker] Failed to send missed reminder:', e)
        }
      }
      // else: BullMQ job exists and will be promoted at startup — let it fire normally
    } else {
      await prisma.reminder.update({ where: { id: reminder.id }, data: { sent: true } })
    }
  }

  const future = await prisma.reminder.findMany({
    where: { sent: false, sendAt: { gt: new Date() } },
  })

  for (const reminder of future) {
    let needsEnqueue = !reminder.bullmqJobId
    if (reminder.bullmqJobId) {
      const job = await reminderQueue.getJob(reminder.bullmqJobId)
      if (!job) needsEnqueue = true
    }
    if (needsEnqueue) {
      console.log(`[worker] Re-enqueuing reminder ${reminder.id}`)
      await enqueueReminder(reminder)
    }
  }

  // Watch recovery: poll ACTIVE watches whose lastCheckedAt is >15min stale (missed while down)
  const staleThreshold = new Date(Date.now() - 15 * 60_000)
  const staleWatches = await prisma.watch.findMany({
    where: { status: 'ACTIVE', OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: staleThreshold } }] },
  })
  if (staleWatches.length > 0) {
    console.log(`[worker] Recovery: ${staleWatches.length} stale watch(es) to check`)
    const seen = new Set<string>()
    for (const w of staleWatches) {
      const key = `${w.term}:${w.crn}`
      if (seen.has(key)) continue
      seen.add(key)
      try {
        const section = await searchByCrn(w.term, w.crn)
        if (!section) continue
        const groupWatches = staleWatches.filter((sw) => sw.term === w.term && sw.crn === w.crn)
        for (const gw of groupWatches) {
          const { transition, seatEventId } = await applyDiff(gw, section.seatsAvailable)
          if (transition === '0_to_N') {
            await scheduleSeatAlert(gw.id, seatEventId)
          }
        }
      } catch (err) {
        console.error(`[worker] Recovery poll failed for CRN ${w.crn}:`, err)
      }
    }
  }

  // Heartbeat gap check — text admin if watcher was down >10min
  const lastHeartbeat = await prisma.metricEvent.findFirst({
    where: { kind: 'poller_heartbeat' },
    orderBy: { createdAt: 'desc' },
  })
  const adminPhone = process.env.ADMIN_PHONE
  if (lastHeartbeat && adminPhone) {
    const gapMs = Date.now() - lastHeartbeat.createdAt.getTime()
    if (gapMs > 10 * 60_000) {
      const gapMin = Math.round(gapMs / 60_000)
      try {
        await sendMessage(adminPhone, `[SeatSnipe] Worker was down ~${gapMin}min — just restarted.`)
      } catch {}
    }
  }

  console.log('[worker] Recovery complete')
  await recoverMissedMessages()
}

const worker = new Worker(
  'reminders',
  async (job) => {
    if (job.name === 'send-one-off') {
      const { userId, message, persistent, oneOffReminderId } = job.data as {
        userId: string
        message: string
        persistent?: boolean
        oneOffReminderId?: string
      }
      // If the reminder was dismissed from the dashboard it will have been deleted
      if (oneOffReminderId) {
        const exists = await prisma.oneOffReminder.findUnique({ where: { id: oneOffReminderId } })
        if (!exists) {
          console.log(`[worker] One-off reminder ${oneOffReminderId} was dismissed — skipping`)
          return
        }
      }
      console.log(`[worker] Sending one-off reminder to user ${userId}`)
      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (user && !user.optedOut) {
        const sentAfter = new Date().toISOString()
        await sendMessage(user.phone, message)
        await prisma.message.create({ data: { userId, direction: 'out', body: message } })
        await appendToConversation(userId, message)
        if (persistent) {
          await scheduleFollowUp({ userId, oneOffMessage: message, followUpNumber: 0, sentAfter })
        }
      }
      if (oneOffReminderId) {
        await prisma.oneOffReminder.update({
          where: { id: oneOffReminderId },
          data: { sent: true },
        })
      }
      return
    }

    if (job.name === 'send-followup') {
      const { assignmentId, oneOffMessage, userId, followUpNumber, sentAfter } = job.data as {
        assignmentId?: string
        oneOffMessage?: string
        userId: string
        followUpNumber: number
        sentAfter: string
      }

      // Stop if the user has replied since the original reminder fired
      const replied = await prisma.message.findFirst({
        where: { userId, direction: 'in', createdAt: { gte: new Date(sentAfter) } },
      })
      if (replied) {
        console.log(`[worker] User ${userId} replied — stopping persistent nudge`)
        return
      }

      let phone: string
      let nagTitle: string
      let nagCourse: string | null = null

      if (assignmentId) {
        const assignment = await prisma.assignment.findUnique({
          where: { id: assignmentId },
          include: { user: true },
        })
        if (!assignment || assignment.status !== 'open' || assignment.user.optedOut) return
        phone = assignment.user.phone
        nagTitle = assignment.title
        nagCourse = assignment.course
      } else {
        const user = await prisma.user.findUnique({ where: { id: userId } })
        if (!user || user.optedOut) return
        phone = user.phone
        nagTitle = oneOffMessage ?? 'that thing you needed to do'
      }

      const message = await generateNagMessage(nagTitle, nagCourse, followUpNumber)
      await sendMessage(phone, message)
      await prisma.message.create({ data: { userId, direction: 'out', body: message } })
      await appendToConversation(userId, message)

      console.log(`[worker] Sent follow-up #${followUpNumber + 1} for user ${userId}`)

      if (followUpNumber < 4) {
        await scheduleFollowUp({ assignmentId, oneOffMessage, userId, followUpNumber: followUpNumber + 1, sentAfter })
      }
      return
    }

    if (job.name === 'send-checkin') {
      const { assignmentId, userId } = job.data as { assignmentId: string; userId: string }
      const assignment = await prisma.assignment.findUnique({
        where: { id: assignmentId },
        include: { user: true },
      })
      if (!assignment || !assignment.checkIn || assignment.status !== 'open' || assignment.user.optedOut || assignment.checkInAt) return

      const label = assignment.title + (assignment.course ? ` for ${assignment.course}` : '')
      const msg = `hey did you submit your ${label}?`
      const sentAt = new Date()
      await sendMessage(assignment.user.phone, msg)
      await prisma.assignment.update({ where: { id: assignmentId }, data: { checkInAt: sentAt } })
      await prisma.message.create({ data: { userId, direction: 'out', body: msg } })
      await appendToConversation(userId, msg)

      await reminderQueue.add(
        'send-checkin-followup',
        { assignmentId, userId, followUpNumber: 0, sentAfter: sentAt.toISOString() },
        { delay: 60 * 60 * 1000, attempts: 3, backoff: { type: 'fixed', delay: 60_000 }, removeOnComplete: true, removeOnFail: false }
      )
      return
    }

    if (job.name === 'send-checkin-followup') {
      const { assignmentId, userId, followUpNumber, sentAfter } = job.data as {
        assignmentId: string; userId: string; followUpNumber: number; sentAfter: string
      }
      const assignment = await prisma.assignment.findUnique({
        where: { id: assignmentId },
        include: { user: true },
      })
      if (!assignment || assignment.status !== 'open' || assignment.user.optedOut) return

      const replied = await prisma.message.findFirst({
        where: { userId, direction: 'in', createdAt: { gte: new Date(sentAfter) } },
      })
      if (replied || followUpNumber >= 2) return

      const nags = [
        `still waiting on that ${assignment.title} confirmation 👀`,
        `ok last time i'll ask — did you submit ${assignment.title}? just reply yes or no`,
      ]
      const msg = nags[followUpNumber]
      const nextSentAt = new Date()
      await sendMessage(assignment.user.phone, msg)
      await prisma.message.create({ data: { userId, direction: 'out', body: msg } })
      await appendToConversation(userId, msg)

      await reminderQueue.add(
        'send-checkin-followup',
        { assignmentId, userId, followUpNumber: followUpNumber + 1, sentAfter: nextSentAt.toISOString() },
        { delay: 60 * 60 * 1000, attempts: 3, backoff: { type: 'fixed', delay: 60_000 }, removeOnComplete: true, removeOnFail: false }
      )
      return
    }

    if (job.name === 'send-seat-alert') {
      const { watchId, seatEventId } = job.data as { watchId: string; seatEventId: string }
      const watch = await prisma.watch.findUnique({
        where: { id: watchId },
        include: { user: true },
      })
      if (!watch || watch.status !== 'ACTIVE' || watch.user.optedOut) return

      const seats = watch.lastSeats
      const courseLabel = watch.sectionLabel ? `${watch.courseCode} (${watch.sectionLabel})` : watch.courseCode
      const msg = `🚨 Seat opened in ${courseLabel} — ${seats} seat${seats === 1 ? '' : 's'} available! Register at gosolar.gsu.edu before it fills up.`

      await sendMessage(watch.user.phone, msg)
      await prisma.watch.update({
        where: { id: watchId },
        data: { alertCount: { increment: 1 }, lastAlertAt: new Date() },
      })
      await prisma.message.create({ data: { userId: watch.userId, direction: 'out', body: msg } })
      await logMetric('alert_sent', watch.userId, { watchId, seatEventId })
      console.log(`[worker] Seat alert sent for watch ${watchId} (${watch.courseCode})`)
      return
    }

    if (job.name === 'send-broadcast') {
      const { phone, message } = job.data as { phone: string; message: string }
      await sendMessage(phone, message)
      return
    }

    if (job.name === 'send-monday-checkin') {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      const users = await prisma.user.findMany({
        where: {
          optedOut: false,
          assignments: { none: { status: 'open' } },
          messages: { none: { direction: 'in', createdAt: { gt: fiveDaysAgo } } },
        },
        include: { _count: { select: { messages: true } } },
      })

      for (const user of users) {
        if (user._count.messages === 0) continue
        try {
          const msg = "new week, what's on your plate? 📚"
          await sendMessage(user.phone, msg)
          await prisma.message.create({ data: { userId: user.id, direction: 'out', body: msg } })
          await appendToConversation(user.id, msg)
        } catch (err) {
          console.error(`[worker] Monday check-in failed for user ${user.id}:`, err)
        }
        await new Promise((r) => setTimeout(r, 300))
      }
      console.log(`[worker] Monday check-in sent to ${users.filter(u => u._count.messages > 0).length} users`)
      return
    }

    const { assignmentId } = job.data as { assignmentId: string }
    console.log(`[worker] Processing reminder for assignment ${assignmentId}`)
    await processReminder(assignmentId)
  },
  {
    connection: workerConnection,
    stalledInterval: 60_000,
    skipLockRenewal: true,
    drainDelay: 10_000,
  }
)

worker.on('completed', (job) => console.log(`[worker] Job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`[worker] Job ${job?.id} failed:`, err.message))
worker.on('error', (err) => console.error('[worker] Worker error:', err))
reminderQueue.on('error', (err) => console.error('[queue] Queue error:', err))

recoverOnStartup().catch((e) => console.error('[worker] Startup recovery failed:', e))
startWatcherLoop(sendMessage)

reminderQueue.add('send-monday-checkin', {}, {
  repeat: { pattern: '0 13 * * 1' }, // Monday 9 AM ET (UTC-4)
  jobId: 'monday-checkin-cron',
}).catch((e) => console.error('[worker] Failed to register Monday cron:', e))

console.log('[worker] Nudge worker started')
