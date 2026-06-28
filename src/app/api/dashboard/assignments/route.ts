import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { cancelPendingReminders, scheduleReminders } from '@/lib/queue'
import { sendMessage } from '@/lib/bluebubbles'

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

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, course, due_at, reminder_offsets, nudge_mode } = await req.json()
  if (!title || !due_at) return NextResponse.json({ error: 'title and due_at required' }, { status: 400 })

  const offsets = Array.isArray(reminder_offsets) && reminder_offsets.length > 0 ? reminder_offsets : [24]

  const assignment = await prisma.assignment.create({
    data: {
      userId: session.userId,
      title,
      course: course ?? null,
      dueAt: new Date(due_at),
      reminderOffsets: offsets,
      nudgeMode: nudge_mode ?? 'basic',
      status: 'open',
      source: 'text',
    },
  })

  await scheduleReminders({
    id: assignment.id,
    dueAt: assignment.dueAt,
    reminderOffsets: assignment.reminderOffsets,
    userId: session.userId,
  })

  const user = await prisma.user.findUnique({ where: { id: session.userId } })
  if (user) {
    const due = assignment.dueAt.toLocaleDateString('en-US', {
      timeZone: user.timezone,
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
    const modeLabel = (nudge_mode ?? 'basic') === 'persistent'
      ? "🔁 I'll nag you on this one"
      : `📌 reminder ${offsets[0]}h before`
    const msg = `added "${assignment.title}"${assignment.course ? ` (${assignment.course})` : ''} — due ${due}. ${modeLabel}`
    await sendMessage(user.phone, msg)
    await prisma.message.create({ data: { userId: user.id, direction: 'out', body: msg } })
  }

  return NextResponse.json({
    id: assignment.id,
    title: assignment.title,
    course: assignment.course,
    dueAt: assignment.dueAt.toISOString(),
    nudgeMode: assignment.nudgeMode,
    nextReminder: null,
  })
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

  if (status === 'canceled') {
    const user = await prisma.user.findUnique({ where: { id: session.userId } })
    if (user) {
      const msg = `canceled "${assignment.title}" — reminders removed`
      await sendMessage(user.phone, msg)
      await prisma.message.create({ data: { userId: user.id, direction: 'out', body: msg } })
    }
  }

  return NextResponse.json({ ok: true })
}
