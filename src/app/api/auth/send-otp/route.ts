import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendMessage } from '@/lib/bluebubbles'
import { normalizePhone } from '@/lib/phone'

export const runtime = 'nodejs'

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(req: NextRequest) {
  const { phone } = await req.json()
  if (!phone || typeof phone !== 'string') {
    return NextResponse.json({ error: 'Phone required' }, { status: 400 })
  }

  const normalized = normalizePhone(phone)

  const user = await prisma.user.findUnique({ where: { phone: normalized } })
  console.log(`[send-otp] phone="${normalized}" user_found=${!!user}`)
  if (!user) {
    // Same response whether user exists or not — avoids phone enumeration
    return NextResponse.json({ ok: true })
  }

  // Rate limit: max 3 OTP requests per phone per 10 minutes
  const recentCount = await prisma.otpCode.count({
    where: {
      phone: normalized,
      createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
    },
  })
  if (recentCount >= 3) {
    return NextResponse.json(
      { error: 'Too many requests. Wait a few minutes and try again.' },
      { status: 429 }
    )
  }

  // Invalidate old codes
  await prisma.otpCode.updateMany({
    where: { phone: normalized, used: false },
    data: { used: true },
  })

  const code = generateCode()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

  await prisma.otpCode.create({ data: { phone: normalized, code, expiresAt } })

  try {
    await sendMessage(normalized, `Your Nudge login code is ${code}. It expires in 10 minutes.`)
  } catch (err) {
    console.error('[send-otp] sendMessage failed:', err instanceof Error ? err.message : String(err))
    return NextResponse.json(
      { error: 'Could not send code — message delivery failed. Try again in a moment.' },
      { status: 502 }
    )
  }

  return NextResponse.json({ ok: true })
}
