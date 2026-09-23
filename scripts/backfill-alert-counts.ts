import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { MAX_ALERTS_PER_WATCH } from '../src/lib/watches'

/**
 * One-off migration for the lifetime alert cap.
 *
 * Before the cap existed, `alertCount` just accumulated forever — one increment
 * per reopening, with no ceiling. Those legacy values break the new rule in two
 * ways, so both get corrected here:
 *
 *   alertCount >= cap  →  PAUSED.  Otherwise the watch can never claim a slot
 *                         again, and since retirement only happens on a
 *                         successful claim it would sit ACTIVE forever: polled
 *                         every cycle, burning Banner quota, occupying one of
 *                         the user's 5 slots, and never able to alert.
 *
 *   0 < alertCount < cap → 0.      These users never agreed to spend part of
 *                         their budget on the old unlimited behaviour, so they
 *                         start fresh with a full set of chances.
 *
 * Dry run by default. Pass --apply to commit.
 */
async function main() {
  const apply = process.argv.includes('--apply')

  const overCap = await prisma.watch.findMany({
    where: { status: 'ACTIVE', alertCount: { gte: MAX_ALERTS_PER_WATCH } },
    include: { user: { select: { phone: true } } },
  })
  const partial = await prisma.watch.findMany({
    where: { status: 'ACTIVE', alertCount: { gt: 0, lt: MAX_ALERTS_PER_WATCH } },
    include: { user: { select: { phone: true } } },
  })

  console.log(`Cap is ${MAX_ALERTS_PER_WATCH} alerts per watch.\n`)

  console.log(`Retire (alertCount >= ${MAX_ALERTS_PER_WATCH}) — ${overCap.length} watch(es):`)
  overCap.forEach((w) =>
    console.log(`  ${w.courseCode} CRN ${w.crn} — ${w.alertCount} alerts sent — ${w.user.phone}`)
  )

  console.log(`\nReset to 0 (0 < alertCount < ${MAX_ALERTS_PER_WATCH}) — ${partial.length} watch(es):`)
  partial.forEach((w) =>
    console.log(`  ${w.courseCode} CRN ${w.crn} — ${w.alertCount} alerts sent — ${w.user.phone}`)
  )

  if (overCap.length === 0 && partial.length === 0) {
    console.log('\nNothing to do.')
    return
  }

  if (!apply) {
    console.log('\nDry run — pass --apply to commit these changes.')
    return
  }

  const retired = await prisma.watch.updateMany({
    where: { status: 'ACTIVE', alertCount: { gte: MAX_ALERTS_PER_WATCH } },
    data: { status: 'PAUSED' },
  })
  const reset = await prisma.watch.updateMany({
    where: { status: 'ACTIVE', alertCount: { gt: 0, lt: MAX_ALERTS_PER_WATCH } },
    data: { alertCount: 0 },
  })

  console.log(`\nRetired ${retired.count} watch(es), reset ${reset.count} watch(es).`)
  console.log('No messages sent — users are not notified about this cleanup.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
