import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { reminderQueue } from '@/lib/queue'

export const runtime = 'nodejs'

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, source } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Redis-only reminder (pre-DB era) — just cancel the BullMQ job
  if (source === 'redis') {
    const job = await reminderQueue.getJob(id)
    if (job && job.data.userId === session.userId) {
      await job.remove().catch(() => {})
    }
    return NextResponse.json({ ok: true })
  }

  // DB-backed reminder
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
