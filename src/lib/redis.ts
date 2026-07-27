import { Redis } from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

const globalForRedis = globalThis as unknown as { _seatsnipeRedis: Redis }

function createRedis(): Redis {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    enableAutoPipelining: false,
  })
  client.on('error', (err) => console.error('[redis] error:', err))
  return client
}

export const redis = globalForRedis._seatsnipeRedis ?? createRedis()

if (process.env.NODE_ENV !== 'production') globalForRedis._seatsnipeRedis = redis

export const SURGE_KEY = 'seatsnipe:surge'

export async function isSurgeMode(): Promise<boolean> {
  try {
    return (await redis.get(SURGE_KEY)) === 'true'
  } catch {
    return false
  }
}

export async function setSurgeMode(on: boolean): Promise<void> {
  if (on) {
    await redis.set(SURGE_KEY, 'true')
  } else {
    await redis.del(SURGE_KEY)
  }
}
