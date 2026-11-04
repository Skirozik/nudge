import { describe, it, expect, vi } from 'vitest'
import { afterSend } from './afterSend'

describe('afterSend', () => {
  it('logs a failed write instead of throwing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(afterSend('Logging the text', async () => { throw new Error('db down') })).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Logging the text'), expect.any(Error))
  })

  it('runs the write', async () => {
    const write = vi.fn(async () => 'ok')
    await afterSend('x', write)
    expect(write).toHaveBeenCalledOnce()
  })
})
