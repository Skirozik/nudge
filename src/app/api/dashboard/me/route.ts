import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { id: session.userId } })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    id: user.id,
    phone: user.phone,
    persona: user.persona,
    timezone: user.timezone,
  })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const data: Record<string, string> = {}

  if (body.persona !== undefined) {
    if (!['coach', 'snarky', 'anxious'].includes(body.persona)) {
      return NextResponse.json({ error: 'Invalid persona' }, { status: 400 })
    }
    data.persona = body.persona
  }

  if (body.timezone !== undefined) {
    data.timezone = body.timezone
  }

  const user = await prisma.user.update({ where: { id: session.userId }, data })
  return NextResponse.json({ persona: user.persona, timezone: user.timezone })
}
