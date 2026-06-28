import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSession, sessionCookieOptions } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { phone, code } = await req.json()
  if (!phone || !code) {
    return NextResponse.json({ error: 'Phone and code required' }, { status: 400 })
  }

  const otp = await prisma.otpCode.findFirst({
    where: {
      phone: phone.trim(),
      used: false,
      expiresAt: { gte: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!otp) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 })
  }

  if (otp.failedAttempts >= 5) {
    return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 })
  }

  if (otp.code !== code.trim()) {
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { failedAttempts: { increment: 1 } },
    })
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 })
  }

  await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } })

  const user = await prisma.user.findUnique({ where: { phone: phone.trim() } })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const token = await createSession(user.id)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(sessionCookieOptions(token))
  return res
}
