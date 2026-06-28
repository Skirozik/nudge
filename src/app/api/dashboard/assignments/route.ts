import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { cancelPendingReminders } from '@/lib/queue'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const assignments = await prisma.assignment.findMany({
    where: { userId: session.userId, status: 'open' },
    orderBy: { dueAt: 'asc' },
    include: { reminders: { where: { sent: false }, orderBy: { sendAt: 'asc' }, take: 1 } },
  })

  return NextResponse.json(assignments.map((a) => ({
    id: a.id,
    title: a.title,
    course: a.course,
    dueAt: a.dueAt,
    nudgeMode: a.nudgeMode,
    nextReminder: a.reminders[0]?.sendAt ?? null,
  })))
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status } = await req.json()
  if (!id || !['done', 'canceled'].includes(status)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const assignment = await prisma.assignment.findUnique({ where: { id } })
  if (!assignment || assignment.userId !== session.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.assignment.update({ where: { id }, data: { status } })
  await cancelPendingReminders(id)

  return NextResponse.json({ ok: true })
}
