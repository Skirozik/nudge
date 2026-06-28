import 'dotenv/config'
import { Worker } from 'bullmq'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../lib/prisma'
import { sendMessage } from '../lib/bluebubbles'
import { reminderQueue, enqueueReminder, scheduleFollowUp } from '../lib/queue'

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

  if (assignment.nudgeMode === 'persistent') {
    await scheduleFollowUp({
      assignmentId,
      userId: user.id,
      followUpNumber: 0,
      sentAfter: sentAt.toISOString(),
    })
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
      console.log(`[worker] Sending missed reminder for ${reminder.assignmentId}`)
      try {
        await processReminder(reminder.assignmentId)
      } catch (e) {
        console.error('[worker] Failed to send missed reminder:', e)
      }
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

  console.log('[worker] Recovery complete')
}

const worker = new Worker(
  'reminders',
  async (job) => {
    if (job.name === 'send-one-off') {
      const { userId, message, persistent } = job.data as { userId: string; message: string; persistent?: boolean }
      console.log(`[worker] Sending one-off reminder to user ${userId}`)
      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (user && !user.optedOut) {
        await sendMessage(user.phone, message)
        await prisma.message.create({ data: { userId, direction: 'out', body: message } })
        if (persistent) {
          const sentAfter = new Date().toISOString()
          await scheduleFollowUp({ userId, oneOffMessage: message, followUpNumber: 0, sentAfter })
        }
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

      console.log(`[worker] Sent follow-up #${followUpNumber + 1} for user ${userId}`)

      if (followUpNumber < 4) {
        await scheduleFollowUp({ assignmentId, oneOffMessage, userId, followUpNumber: followUpNumber + 1, sentAfter })
      }
      return
    }

    const { assignmentId } = job.data as { assignmentId: string }
    console.log(`[worker] Processing reminder for assignment ${assignmentId}`)
    await processReminder(assignmentId)
  },
  { connection: workerConnection }
)

worker.on('completed', (job) => console.log(`[worker] Job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`[worker] Job ${job?.id} failed:`, err.message))

recoverOnStartup().catch((e) => console.error('[worker] Startup recovery failed:', e))

console.log('[worker] Nudge worker started')
