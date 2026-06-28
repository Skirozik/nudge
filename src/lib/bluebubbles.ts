export async function sendTypingIndicator(phone: string): Promise<void> {
  const url = process.env.BLUEBUBBLES_URL
  const password = process.env.BLUEBUBBLES_PASSWORD
  if (!url || !password) return

  const chatGuid = encodeURIComponent(`iMessage;-;${phone}`)
  await fetch(
    `${url}/api/v1/chat/${chatGuid}/typing?password=${encodeURIComponent(password)}`,
    { method: 'POST' }
  ).catch(() => {})
}

export async function downloadAttachment(
  guid: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const url = process.env.BLUEBUBBLES_URL
  const password = process.env.BLUEBUBBLES_PASSWORD
  if (!url || !password) return null

  const res = await fetch(
    `${url}/api/v1/attachment/${encodeURIComponent(guid)}/download?password=${encodeURIComponent(password)}`
  ).catch(() => null)
  if (!res || !res.ok) return null

  const buffer = Buffer.from(await res.arrayBuffer())
  const mimeType = res.headers.get('content-type') ?? 'image/jpeg'
  return { buffer, mimeType }
}

export async function sendMessage(phone: string, text: string): Promise<void> {
  const url = process.env.BLUEBUBBLES_URL
  const password = process.env.BLUEBUBBLES_PASSWORD
  const method = process.env.BLUEBUBBLES_METHOD ?? 'apple-script'

  if (!url || !password) {
    throw new Error('BlueBubbles not configured: set BLUEBUBBLES_URL and BLUEBUBBLES_PASSWORD in .env')
  }

  const res = await fetch(
    `${url}/api/v1/message/text?password=${encodeURIComponent(password)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatGuid: `iMessage;-;${phone}`,
        message: text,
        method,
        tempGuid: `nudge-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }),
    }
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`BlueBubbles API error ${res.status}: ${body}`)
  }
}
