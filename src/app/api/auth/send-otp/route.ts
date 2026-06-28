import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendMessage } from '@/lib/bluebubbles'

export const runtime = 'nodejs'

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(req: NextRequest) {
  const { phone } = await req.json()
  if (!phone || typeof phone !== 'string') {
    return NextResponse.json({ error: 'Phone required' }, { status: 400 })
  }

  const normalized = phone.trim()

  // Check user exists
  const user = await prisma.user.findUnique({ where: { phone: normalized } })
  if (!user) {
    return NextResponse.json(
      { error: 'No account found for that number. Text hinudge@icloud.com first to get started.' },
      { status: 404 }
    )
  }

  // Invalidate old codes
  await prisma.otpCode.updateMany({
    where: { phone: normalized, used: false },
    data: { used: true },
  })

  const code = generateCode()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 min

  await prisma.otpCode.create({ data: { phone: normalized, code, expiresAt } })

  await sendMessage(normalized, `Your Nudge login code is ${code}. It expires in 10 minutes.`)

  return NextResponse.json({ ok: true })
}
