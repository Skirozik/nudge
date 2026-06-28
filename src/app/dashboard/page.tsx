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

  return (
    <DashboardClient
      user={{ phone: user.phone, persona: user.persona, timezone: user.timezone }}
      initialAssignments={initialData}
    />
  )
}
