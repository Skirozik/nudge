// Pretend to be a student texting Nudge. Sends the same webhook BlueBubbles
// would, to your local server. Start the app with MESSAGING_MODE=console and
// the replies print in the terminal running `npm run dev`.
//
//   npm run text -- "watch csc 1301"
//   npm run text -- --from +14045550199 "georgia tech"
//   npm run text -- --url http://localhost:3001 "hi"

try {
  process.loadEnvFile('.env')
} catch {
  // no .env file: rely on the shell's environment
}

const args = process.argv.slice(2)
let from = '+14045550123'
let base = 'http://localhost:3000'
const words = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--from') from = args[++i]
  else if (args[i] === '--url') base = args[++i]
  else words.push(args[i])
}
const text = words.join(' ').trim()

if (!text) {
  console.error('Usage: npm run text -- [--from +14045550123] [--url http://localhost:3000] "message"')
  process.exit(1)
}
const secret = process.env.WEBHOOK_SECRET
if (!secret) {
  console.error('WEBHOOK_SECRET is missing. Add it to .env (any value works locally).')
  process.exit(1)
}

const payload = {
  type: 'new-message',
  data: {
    guid: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    isFromMe: false,
    hasAttachments: false,
    attachments: [],
    handle: { address: from },
    chats: [{ guid: `iMessage;-;${from}` }],
  },
}

try {
  const res = await fetch(`${base}/api/webhook/bluebubbles?secret=${encodeURIComponent(secret)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.text()
  if (!res.ok) {
    console.error(`Webhook answered ${res.status}: ${body}`)
    process.exit(1)
  }
  console.log(`Sent from ${from}: "${text}". The reply prints in the npm run dev terminal.`)
} catch (err) {
  console.error(`Couldn't reach ${base}. Is \`npm run dev\` running?`, err instanceof Error ? err.message : err)
  process.exit(1)
}
