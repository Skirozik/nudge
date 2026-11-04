/**
 * Runs a write that comes after a text already went out: the message log,
 * conversation history, a metric, or the next job in a chain. A failure is
 * logged and never thrown. A thrown error would fail the job, and BullMQ's
 * retry would text the student the same thing again.
 */
export async function afterSend(label: string, write: () => Promise<unknown>): Promise<void> {
  try {
    await write()
  } catch (err) {
    console.error(`[worker] ${label} failed after the text was sent (not retrying, it would text them again):`, err)
  }
}
