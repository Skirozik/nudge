import { redis } from '../redis'
import { sendMessage } from '../bluebubbles'

/**
 * Texts the admin about a payments problem, at most once a day for each kind.
 * Fire-and-forget: it never throws and callers don't wait on it.
 */
export function notifyAdminDaily(kind: string, text: string): void {
  const adminPhone = process.env.ADMIN_PHONE
  if (!adminPhone) return
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  void (async () => {
    try {
      const first = await redis.set(`seatsnipe:pay:notice:${kind}:${day}`, '1', 'EX', 2 * 24 * 60 * 60, 'NX')
      if (first === 'OK') await sendMessage(adminPhone, text)
    } catch (err) {
      console.error(`[payments] admin notice ${kind} failed:`, err)
    }
  })()
}
