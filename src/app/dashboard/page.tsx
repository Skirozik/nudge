import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import DashboardClient from './DashboardClient'

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
    />
  )
}
