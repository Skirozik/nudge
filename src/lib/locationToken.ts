import crypto from 'crypto'
import { prisma } from './prisma'

export async function getOrCreateLocationToken(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  if (user.locationToken) return user.locationToken
  const token = crypto.randomBytes(24).toString('hex')
  await prisma.user.update({ where: { id: userId }, data: { locationToken: token } })
  return token
}
