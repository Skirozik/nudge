import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendMessage, sendTypingIndicator } from '@/lib/bluebubbles'
import { runAgent } from '@/lib/agent'

export const runtime = 'nodejs'
export const maxDuration = 60

interface BBPayload {
  type: string
  data: {
    guid?: string
    text?: string
    isFromMe?: boolean
    handle?: { address: string }
    chats?: Array<{ guid: string }>
  }
}

// In-memory dedup cache — BlueBubbles often fires the same webhook twice
const recentGuids = new Set<string>()
function isDuplicate(guid: string): boolean {
  if (recentGuids.has(guid)) return true
  recentGuids.add(guid)
  setTimeout(() => recentGuids.delete(guid), 5 * 60 * 1000)
  return false
}

export async function POST(req: NextRequest) {
  // Verify secret appended to webhook URL: ?secret=YOUR_WEBHOOK_SECRET
  const secret = req.nextUrl.searchParams.get('secret')
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: BBPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Only handle inbound messages (BlueBubbles also sends read receipts, typing, etc.)
  if (body.type !== 'new-message') {
    return NextResponse.json({ ok: true })
  }

  const { data } = body

  // Ignore messages we sent
  if (data.isFromMe) {
    return NextResponse.json({ ok: true })
  }

  // Deduplicate — BlueBubbles sends the same event twice
  if (data.guid && isDuplicate(data.guid)) {
    return NextResponse.json({ ok: true })
  }

  // Skip group chats (Phase 1: 1-on-1 only)
  const chatGuid = data.chats?.[0]?.guid ?? ''
  if (chatGuid.includes(';+;')) {
    return NextResponse.json({ ok: true })
  }

  const phone = data.handle?.address
  if (!phone) {
    return NextResponse.json({ error: 'No phone address in payload' }, { status: 400 })
  }

  const text = data.text?.trim() ?? ''
  if (!text) return NextResponse.json({ ok: true })

  const upper = text.toUpperCase()

  // DASHBOARD keyword — send link
  if (upper === 'DASHBOARD') {
    const dashUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/dashboard`
    await sendMessage(phone, `Here's your dashboard: ${dashUrl}`)
    return NextResponse.json({ ok: true })
  }

  // STOP opt-out — carrier standard: no reply
  if (upper === 'STOP') {
    await prisma.user.upsert({
      where: { phone },
      update: { optedOut: true },
      create: { phone, optedOut: true },
    })
    return NextResponse.json({ ok: true })
  }

  // START opt back in
  if (upper === 'START') {
    await prisma.user.upsert({
      where: { phone },
      update: { optedOut: false },
      create: { phone, optedOut: false },
    })
    await sendMessage(phone, "You're back! I'm Nudge, your study buddy. What's due?")
    return NextResponse.json({ ok: true })
  }

  // Get or create user
  let user = await prisma.user.findUnique({ where: { phone } })
  if (user?.optedOut) return NextResponse.json({ ok: true })
  const isNewUser = !user
  if (!user) user = await prisma.user.create({ data: { phone } })

  // Log inbound
  await prisma.message.create({
    data: { userId: user.id, direction: 'in', body: text },
  })

  // Run agent and reply
  void sendTypingIndicator(phone)
  try {
    const reply = await runAgent(user.id, text)
    if (reply) {
      await sendMessage(phone, reply)
      await prisma.message.create({
        data: { userId: user.id, direction: 'out', body: reply },
      })
    }

    if (isNewUser) {
      const tip = "💡 Quick tip: add me to your allowed contacts so reminders get through even on Do Not Disturb → Settings › Focus › Do Not Disturb › People › Add."
      await sendMessage(phone, tip)
      await prisma.message.create({ data: { userId: user.id, direction: 'out', body: tip } })

      const dashUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/dashboard`
      const dashMsg = `You can also manage your assignments and settings at ${dashUrl}`
      await sendMessage(phone, dashMsg)
      await prisma.message.create({ data: { userId: user.id, direction: 'out', body: dashMsg } })
    }
  } catch (err) {
    console.error('[webhook] agent error:', err)
    await sendMessage(phone, "Something glitched on my end — try again?")
  }

  return NextResponse.json({ ok: true })
}
