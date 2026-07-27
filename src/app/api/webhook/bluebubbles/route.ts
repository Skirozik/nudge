import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendMessage, sendTypingIndicator, downloadAttachment } from '@/lib/bluebubbles'
import { runAgent } from '@/lib/agent'
import { parseSyllabusImage } from '@/lib/visionParser'
import { normalizePhone } from '@/lib/phone'
import { setSurgeMode } from '@/lib/redis'
import { scheduleBroadcast } from '@/lib/queue'

export const runtime = 'nodejs'
export const maxDuration = 60

interface BBPayload {
  type: string
  data: {
    guid?: string
    text?: string
    isFromMe?: boolean
    hasAttachments?: boolean
    attachments?: Array<{
      guid: string
      mimeType: string
      transferName?: string
    }>
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
  const normalizedPhone = normalizePhone(phone)

  // Handle image attachments (syllabus photos)
  console.log('[webhook] payload data keys:', JSON.stringify({ hasAttachments: data.hasAttachments, attachmentCount: data.attachments?.length, mimeTypes: data.attachments?.map(a => a.mimeType), textLength: data.text?.length }))
  const imageAttachment = data.attachments?.find((a) => a.mimeType?.startsWith('image/'))

  if (imageAttachment) {
    let user = await prisma.user.findUnique({ where: { phone: normalizedPhone } })
    if (user?.optedOut) return NextResponse.json({ ok: true })
    if (!user) user = await prisma.user.create({ data: { phone: normalizedPhone } })

    await prisma.message.create({ data: { userId: user.id, direction: 'in', body: '[photo]' } })
    void sendTypingIndicator(phone)

    try {
      const attachment = await downloadAttachment(imageAttachment.guid)
      if (!attachment) {
        await sendMessage(phone, "couldn't download that photo — try sending it again?")
        return NextResponse.json({ ok: true })
      }

      const extracted = await parseSyllabusImage(attachment.buffer, attachment.mimeType, user.timezone)

      if (extracted.length === 0) {
        const reply = "couldn't make out any assignments in that one — try a clearer photo?"
        await sendMessage(phone, reply)
        await prisma.message.create({ data: { userId: user.id, direction: 'out', body: reply } })
        return NextResponse.json({ ok: true })
      }

      const userTz = user.timezone ?? 'America/New_York'
      const lines = extracted.map((a, i) => {
        const due = a.dueAt ? new Date(a.dueAt).toLocaleDateString('en-US', { timeZone: userTz, month: 'short', day: 'numeric' }) : 'no date'
        return `${i + 1}. ${a.title}${a.course ? ` (${a.course})` : ''} — due ${due}`
      })
      const preview = `found ${extracted.length} assignment${extracted.length === 1 ? '' : 's'} in your syllabus:\n${lines.join('\n')}`
      await sendMessage(phone, preview)
      await prisma.message.create({ data: { userId: user.id, direction: 'out', body: preview } })

      const captionText = data.text?.trim()
      const syntheticMsg = `[The user sent a syllabus photo${captionText ? ` and also said: "${captionText}"` : ''}. I extracted these assignments: ${JSON.stringify(extracted)}. Ask the user which ones to save, then call add_assignment for each confirmed one with source set to "screenshot". If they say "save all" or "all of them", save every one without asking about each individually — but still confirm reminder preferences in bulk.]`
      const agentReply = await runAgent(user.id, syntheticMsg)
      if (agentReply) {
        await sendMessage(phone, agentReply)
        await prisma.message.create({ data: { userId: user.id, direction: 'out', body: agentReply } })
      }
    } catch (err) {
      console.error('[webhook] image handling error:', err)
      try {
        await sendMessage(phone, "something went wrong reading that photo — try again?")
      } catch (sendErr) {
        console.error('[webhook] sendMessage failed after image error:', sendErr instanceof Error ? sendErr.message : String(sendErr))
      }
    }

    return NextResponse.json({ ok: true })
  }

  const text = data.text?.trim() ?? ''
  if (!text) return NextResponse.json({ ok: true })

  const upper = text.toUpperCase()

  // STOP opt-out — carrier standard: no reply
  if (upper === 'STOP') {
    await prisma.user.upsert({
      where: { phone: normalizedPhone },
      update: { optedOut: true },
      create: { phone: normalizedPhone, optedOut: true },
    })
    return NextResponse.json({ ok: true })
  }

  // START opt back in
  if (upper === 'START') {
    await prisma.user.upsert({
      where: { phone: normalizedPhone },
      update: { optedOut: false },
      create: { phone: normalizedPhone, optedOut: false },
    })
    await sendMessage(normalizedPhone, "You're back! I'm Nudge, your study buddy. What's due?")
    return NextResponse.json({ ok: true })
  }

  // Get or create user
  let user = await prisma.user.findUnique({ where: { phone: normalizedPhone } })
  if (user?.optedOut) return NextResponse.json({ ok: true })

  // DASHBOARD keyword — only reply to active (non-opted-out) users
  if (upper === 'DASHBOARD') {
    const dashUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/dashboard`
    await sendMessage(normalizedPhone, `Here's your dashboard: ${dashUrl}`)
    return NextResponse.json({ ok: true })
  }

  const isNewUser = !user
  if (!user) {
    const lower = text.toLowerCase()
    const source = ['nsbe', 'gdg', 'reddit', 'colorstack'].find((kw) => lower.includes(kw)) ?? null
    user = await prisma.user.create({ data: { phone: normalizedPhone, source } })
  }

  // Log inbound
  await prisma.message.create({
    data: { userId: user.id, direction: 'in', body: text },
  })

  // New users get a welcome sequence — skip the agent on their first message
  if (isNewUser) {
    try {
      const welcome = "HI! I'm Nudge! I send you reminders for your assignments and daily tasks so nothing slips through. just tell me what's due and I'll handle the rest 📚"
      await sendMessage(normalizedPhone, welcome)
      await prisma.message.create({ data: { userId: user.id, direction: 'out', body: welcome } })

      const tip = "💡 Quick tip: add me to your allowed contacts so reminders get through even on Do Not Disturb → Settings › Focus › Do Not Disturb › People › Add."
      await sendMessage(normalizedPhone, tip)
      await prisma.message.create({ data: { userId: user.id, direction: 'out', body: tip } })

      const dashUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/dashboard`
      const dashMsg = `You can also manage your assignments and settings at ${dashUrl}`
      await sendMessage(normalizedPhone, dashMsg)
      await prisma.message.create({ data: { userId: user.id, direction: 'out', body: dashMsg } })
    } catch (err) {
      console.error('[webhook] new user welcome error:', err)
    }
    return NextResponse.json({ ok: true })
  }

  // Admin command short-circuit — must be before runAgent()
  if (process.env.ADMIN_PHONE && normalizedPhone === normalizePhone(process.env.ADMIN_PHONE)) {
    const cmd = text.trim().toUpperCase()

    if (cmd === 'STATS') {
      const [userCount, watchCount, alertCount, seatCaughtCount] = await Promise.all([
        prisma.user.count({ where: { optedOut: false } }),
        prisma.watch.count({ where: { status: 'ACTIVE' } }),
        prisma.metricEvent.count({ where: { kind: 'alert_sent', createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
        prisma.metricEvent.count({ where: { kind: 'seat_caught' } }),
      ])
      const stats = `Users: ${userCount}\nActive watches: ${watchCount}\nAlerts (24h): ${alertCount}\nSeats caught (all time): ${seatCaughtCount}`
      await sendMessage(normalizedPhone, stats)
      return NextResponse.json({ ok: true })
    }

    if (cmd === 'SURGE ON') {
      await setSurgeMode(true)
      await sendMessage(normalizedPhone, 'surge on — polling every ~75s')
      return NextResponse.json({ ok: true })
    }

    if (cmd === 'SURGE OFF') {
      await setSurgeMode(false)
      await sendMessage(normalizedPhone, 'surge off — polling every 5min')
      return NextResponse.json({ ok: true })
    }

    if (cmd.startsWith('BROADCAST ')) {
      const broadcastMsg = text.slice('BROADCAST '.length).trim()
      if (broadcastMsg) {
        const recipients = await prisma.user.findMany({ where: { optedOut: false }, select: { id: true, phone: true } })
        await Promise.all(recipients.map((u) => scheduleBroadcast(u.id, u.phone, broadcastMsg)))
        await sendMessage(normalizedPhone, `queued ${recipients.length} message${recipients.length === 1 ? '' : 's'}`)
        return NextResponse.json({ ok: true })
      }
    }
  }

  // Run agent and reply
  void sendTypingIndicator(normalizedPhone)
  try {
    const reply = await runAgent(user.id, text)
    if (reply) {
      await sendMessage(normalizedPhone, reply)
      await prisma.message.create({
        data: { userId: user.id, direction: 'out', body: reply },
      })
    }
  } catch (err) {
    const errMsg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err)
    console.error('[webhook] agent error:', errMsg)
    try {
      await sendMessage(phone, "Something glitched on my end — try again?")
    } catch (sendErr) {
      console.error('[webhook] sendMessage failed after agent error:', sendErr instanceof Error ? sendErr.message : String(sendErr))
    }
  }

  return NextResponse.json({ ok: true })
}
