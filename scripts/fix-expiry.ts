import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { sendMessage } from '../src/lib/bluebubbles'

async function main() {
  const dryRun = process.argv[2] !== '--send'

  const expired = await prisma.watch.findMany({
    where: { status: 'EXPIRED' },
    include: { user: { select: { phone: true } } },
  })

  console.log(`Found ${expired.length} recently expired watches`)
  expired.forEach(w => console.log(`  ${w.courseCode} CRN ${w.crn} — ${w.user.phone}`))

  if (expired.length === 0) return

  // Reactivate
  if (!dryRun) {
    await prisma.watch.updateMany({
      where: { status: 'EXPIRED' },
      data: { status: 'ACTIVE' },
    })
    console.log(`\nReactivated ${expired.length} watches`)
  }

  // Get unique phones
  const phones = [...new Set(expired.map(w => w.user.phone))]
  console.log(`\nUnique users to notify: ${phones.length}`)
  phones.forEach(p => console.log(`  ${p}`))

  if (!dryRun) {
    const msg = "disregard that last message — registration is still open until Friday at 5pm. your watches are back on 👍"
    for (const phone of phones) {
      await sendMessage(phone, msg)
      console.log(`Sent to ${phone}`)
      await new Promise(r => setTimeout(r, 300))
    }
  } else {
    console.log('\nDry run — pass --send to reactivate watches and send messages')
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
