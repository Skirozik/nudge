import { prisma } from './prisma'

// Admin test mode, so the welcome can be tried from the admin's own phone.
// NEWUSER sets the real account aside under a parked phone, so the admin's next
// text counts as a first text from a new number. NEWUSER OFF deletes the test
// account and everything it made, and puts the real account back.
// While it's on, the real account's reminders and alerts can't reach the admin.

// Never produced by normalizePhone, so no inbound text can match a parked account
const PARKED_SUFFIX = '#parked'

export function parkedPhone(phone: string): string {
  return `${phone}${PARKED_SUFFIX}`
}

/** Starts test mode, or starts it over (wiping the test account) if it's already on. */
export async function startNewUserTest(phone: string): Promise<string> {
  const parked = await prisma.user.findUnique({ where: { phone: parkedPhone(phone) } })
  if (parked) {
    const test = await prisma.user.findUnique({ where: { phone } })
    if (test) await prisma.$transaction(deleteUserOps(test.id))
    return 'test mode restarted: your next text counts as a first text again. NEWUSER OFF gets your account back.'
  }

  const real = await prisma.user.findUnique({ where: { phone } })
  if (!real) return "you don't have an account yet, so your next text already counts as a first text."
  await prisma.user.update({ where: { id: real.id }, data: { phone: parkedPhone(phone) } })
  return "test mode on: your next text counts as a first text from a new number. NEWUSER starts over, NEWUSER OFF gets your account back. while it's on, your own reminders and alerts can't reach you."
}

/** Ends test mode: deletes the test account and restores the real one. */
export async function endNewUserTest(phone: string): Promise<string> {
  const parked = await prisma.user.findUnique({ where: { phone: parkedPhone(phone) } })
  if (!parked) return "test mode isn't on."

  const test = await prisma.user.findUnique({ where: { phone } })
  await prisma.$transaction([
    ...(test ? deleteUserOps(test.id) : []),
    prisma.user.update({ where: { id: parked.id }, data: { phone } }),
  ])
  return 'test mode off: your account is back.'
}

/**
 * Deletes a user and every row that points at them, children first (no
 * relation cascades). Queued jobs for them find nothing and skip.
 */
function deleteUserOps(userId: string) {
  return [
    prisma.reminder.deleteMany({ where: { assignment: { userId } } }),
    prisma.assignment.deleteMany({ where: { userId } }),
    prisma.conversation.deleteMany({ where: { userId } }),
    prisma.message.deleteMany({ where: { userId } }),
    prisma.oneOffReminder.deleteMany({ where: { userId } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.watch.deleteMany({ where: { userId } }),
    prisma.locationReminder.deleteMany({ where: { userId } }),
    prisma.metricEvent.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]
}
