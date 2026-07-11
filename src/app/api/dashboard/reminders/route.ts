import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { reminderQueue } from '@/lib/queue'

export const runtime = 'nodejs'

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const reminder = await prisma.oneOffReminder.findUnique({ where: { id } })
  if (!reminder || reminder.userId !== session.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (reminder.bullmqJobId) {
    const job = await reminderQueue.getJob(reminder.bullmqJobId)
    if (job) await job.remove().catch(() => {})
  }

  await prisma.oneOffReminder.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
