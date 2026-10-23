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

/** All schools. Each school also has its own flag at `seatsnipe:surge:<id>`. */
export const SURGE_KEY = 'seatsnipe:surge'
const schoolSurgeKey = (schoolId: string) => `${SURGE_KEY}:${schoolId}`

/** Surge is on for a school when its own flag or the all-schools flag is set. */
export async function isSurgeMode(schoolId?: string): Promise<boolean> {
  try {
    const keys = schoolId ? [SURGE_KEY, schoolSurgeKey(schoolId)] : [SURGE_KEY]
    const values = await redis.mget(...keys)
    return values.some((v) => v === 'true')
  } catch {
    return false
  }
}

/** With a school, flips just that school. Without one, flips all schools; turning all off also clears each school's flag. */
export async function setSurgeMode(on: boolean, schoolId?: string, allSchoolIds: string[] = []): Promise<void> {
  if (schoolId) {
    if (on) await redis.set(schoolSurgeKey(schoolId), 'true')
    else await redis.del(schoolSurgeKey(schoolId))
    return
  }
  if (on) {
    await redis.set(SURGE_KEY, 'true')
  } else {
    await redis.del(SURGE_KEY, ...allSchoolIds.map(schoolSurgeKey))
  }
}
