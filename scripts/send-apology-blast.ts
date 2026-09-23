import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { sendMessage } from '../src/lib/bluebubbles'

/**
 * One-off apology blast for the 2026-09-22 duplicate Monday check-in.
 *
 * The overdue `send-monday-checkin` job re-ran under stalled-job re-delivery and
 * every active user got the same "what's on your plate?" text twice. This
 * apologises and points at the opt-out.
 *
 * Dry-run by default. Pass --send to actually deliver.
 *
 * PREREQUISITE: the UNSUBSCRIBE keyword handler must be DEPLOYED before this
 * runs, or the opt-out this message promises silently does nothing and the
 * agent replies to "UNSUBSCRIBE" as if it were small talk.
 */

const CHECKIN_BODY = "new week, what's on your plate? 📚"

const APOLOGY =
  "hey — sorry for the double text earlier, that was a bug on our end, not something you did. it's fixed.\n\n" +
  "if you'd rather not get these at all, just text UNSUBSCRIBE and i'll stop."

// Pace sends. BlueBubbles started returning 502 under the unthrottled burst
// during the incident itself, so don't recreate the same load here.
const PACE_MS = 400
const MAX_ATTEMPTS = 3

const LIVE = process.argv.includes('--send')

async function main() {
  const burstStart = new Date('2026-09-22T00:00:00Z')

  const rows = await prisma.message.findMany({
    where: { direction: 'out', body: CHECKIN_BODY, createdAt: { gte: burstStart } },
    select: { userId: true },
  })
  const copies = new Map<string, number>()
  for (const r of rows) copies.set(r.userId, (copies.get(r.userId) ?? 0) + 1)
  const duped = [...copies.entries()].filter(([, c]) => c > 1).map(([u]) => u)

  // Idempotency: never apologise twice for apologising twice.
  const already = await prisma.message.findMany({
    where: { direction: 'out', body: APOLOGY, userId: { in: duped } },
    select: { userId: true },
  })
  const alreadySent = new Set(already.map((m) => m.userId))

  const recipients = await prisma.user.findMany({
    where: { id: { in: duped }, optedOut: false },
    select: { id: true, phone: true },
  })
  const todo = recipients.filter((u) => !alreadySent.has(u.id))

  console.log(`affected users (>1 copy today) : ${duped.length}`)
  console.log(`still active                   : ${recipients.length}`)
  console.log(`already apologised to (skip)   : ${recipients.length - todo.length}`)
  console.log(`will send to                   : ${todo.length}`)
  console.log(`\n--- message ---\n${APOLOGY}\n---------------\n`)

  if (!LIVE) {
    console.log('DRY RUN — no messages sent. re-run with --send to deliver.')
    return
  }

  let ok = 0
  const failed: { phone: string; err: string }[] = []

  for (const [i, user] of todo.entries()) {
    let sent = false
    let lastErr = ''
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !sent; attempt++) {
      try {
        await sendMessage(user.phone, APOLOGY)
        sent = true
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err)
        if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 2000 * attempt))
      }
    }

    if (sent) {
      ok++
      // Write the row only after a confirmed send, so a retry of this script
      // re-sends genuine failures instead of skipping them as "already done".
      await prisma.message.create({ data: { userId: user.id, direction: 'out', body: APOLOGY } })
      console.log(`[${i + 1}/${todo.length}] sent ${user.phone}`)
    } else {
      failed.push({ phone: user.phone, err: lastErr })
      console.error(`[${i + 1}/${todo.length}] FAILED ${user.phone}: ${lastErr}`)
    }

    await new Promise((r) => setTimeout(r, PACE_MS))
  }

  console.log(`\ndone. sent=${ok} failed=${failed.length}`)
  if (failed.length) console.log('failures:', JSON.stringify(failed, null, 2))
}

main().finally(() => prisma.$disconnect())
