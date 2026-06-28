import { Queue } from 'bullmq'
import { prisma } from './prisma'
import { shiftToSocialHour } from './timezone'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

// Use plain options so BullMQ creates its own ioredis instance — avoids version conflicts
export const redisConnection = { url: REDIS_URL, maxRetriesPerRequest: null as null }

export const reminderQueue = new Queue('reminders', { connection: redisConnection })

export async function scheduleReminders(assignment: {
  id: string
  dueAt: Date
  reminderOffsets: number[]
  userId: string
}): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: assignment.userId } })
  const tz = user?.timezone ?? 'America/New_York'
  const offsets = [...assignment.reminderOffsets].sort((a: number, b: number) => a - b)

  for (const offsetHours of offsets) {
    const rawSendAt = new Date(assignment.dueAt.getTime() - offsetHours * 60 * 60 * 1000)
    const now = new Date()

    let sendAt: Date

    if (rawSendAt <= now) {
      // Already past — only send immediately for the nearest (smallest) offset
      if (offsetHours === offsets[0]) {
        sendAt = new Date(now.getTime() + 5_000)
      } else {
        continue
      }
    } else {
      sendAt = shiftToSocialHour(rawSendAt, tz)
    }

    const delay = Math.max(0, sendAt.getTime() - Date.now())

    const job = await reminderQueue.add(
      'send-reminder',
      { assignmentId: assignment.id, offsetHours },
      {
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: false,
        removeOnFail: false,
      }
    )

    await prisma.reminder.create({
      data: {
        assignmentId: assignment.id,
        sendAt,
        bullmqJobId: job.id ?? null,
      },
    })
  }
}

export async function scheduleFollowUp(params: {
  assignmentId?: string
  oneOffMessage?: string
  userId: string
  followUpNumber: number
  sentAfter: string
}): Promise<void> {
  await reminderQueue.add('send-followup', params, {
    delay: 30_000,
    attempts: 3,
    backoff: { type: 'fixed', delay: 10_000 },
    removeOnComplete: true,
    removeOnFail: false,
  })
}

export async function scheduleOneOffReminder(
  userId: string,
  message: string,
  fireAt: Date,
  persistent = false
): Promise<void> {
  const delay = Math.max(0, fireAt.getTime() - Date.now())
  await reminderQueue.add(
    'send-one-off',
    { userId, message, persistent },
    {
      delay,
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: true,
      removeOnFail: false,
    }
  )
}

export async function cancelPendingReminders(assignmentId: string): Promise<void> {
  const reminders = await prisma.reminder.findMany({
    where: { assignmentId, sent: false },
  })

  for (const reminder of reminders) {
    if (reminder.bullmqJobId) {
      const job = await reminderQueue.getJob(reminder.bullmqJobId)
      if (job) await job.remove()
    }
  }
}

export async function enqueueReminder(reminder: {
  id: string
  assignmentId: string
  sendAt: Date
}): Promise<void> {
  const delay = Math.max(0, reminder.sendAt.getTime() - Date.now())

  const job = await reminderQueue.add(
    'send-reminder',
    { assignmentId: reminder.assignmentId },
    {
      delay,
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: false,
      removeOnFail: false,
    }
  )

  await prisma.reminder.update({
    where: { id: reminder.id },
    data: { bullmqJobId: job.id ?? null },
  })
}
