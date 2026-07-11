import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { reminderQueue } from '@/lib/queue'
import DashboardClient from './DashboardClient'

export const runtime = 'nodejs'
export const metadata = { title: 'Dashboard — Nudge' }

export default async function DashboardPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const assignments = await prisma.assignment.findMany({
    where: { userId: user.id, status: 'open' },
    orderBy: { dueAt: 'asc' },
    include: {
      reminders: { where: { sent: false }, orderBy: { sendAt: 'asc' }, take: 1 },
    },
  })

  const initialData = assignments.map((a) => ({
    id: a.id,
    title: a.title,
    course: a.course,
    dueAt: a.dueAt.toISOString(),
    nudgeMode: a.nudgeMode,
    nextReminder: a.reminders[0]?.sendAt?.toISOString() ?? null,
  }))

  const messages = await prisma.message.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  const upcomingReminders = await prisma.reminder.findMany({
    where: { assignment: { userId: user.id, status: 'open' }, sent: false },
    orderBy: { sendAt: 'asc' },
    include: { assignment: { select: { title: true, course: true } } },
  })

  const now = new Date()

  const oneOffReminders = await prisma.oneOffReminder.findMany({
    where: { userId: user.id, sent: false, fireAt: { gte: now } },
    orderBy: { fireAt: 'asc' },
  })

  // Compatibility shim: surface old reminders that only exist as BullMQ jobs
  // (set before the OneOffReminder table existed). Once those jobs fire naturally
  // this branch will always return an empty array and can be removed.
  const dbJobIds = new Set(oneOffReminders.map((r) => r.bullmqJobId).filter(Boolean))
  const delayedJobs = await reminderQueue.getDelayed().catch(() => [])
  const redisOnlyReminders = delayedJobs
    .filter((job) =>
      job.name === 'send-one-off' &&
      job.data.userId === user.id &&
      !job.data.oneOffReminderId &&
      !dbJobIds.has(job.id!) &&
      new Date(job.timestamp + job.delay) >= now
    )
    .map((job) => ({
      id: job.id!,
      message: job.data.message as string,
      fireAt: new Date(job.timestamp + job.delay).toISOString(),
      source: 'redis' as const,
    }))

  const allOneOffReminders = [
    ...oneOffReminders.map((r) => ({
      id: r.id,
      message: r.message,
      fireAt: r.fireAt.toISOString(),
      source: 'db' as const,
    })),
    ...redisOnlyReminders,
  ].sort((a, b) => new Date(a.fireAt).getTime() - new Date(b.fireAt).getTime())

  return (
    <DashboardClient
      user={{ phone: user.phone, persona: user.persona, timezone: user.timezone }}
      initialAssignments={initialData}
      messages={messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      }))}
      upcomingReminders={upcomingReminders.map((r) => ({
        id: r.id,
        sendAt: r.sendAt.toISOString(),
        assignmentTitle: r.assignment.title,
        assignmentCourse: r.assignment.course,
      }))}
      initialOneOffReminders={allOneOffReminders}
    />
  )
}
