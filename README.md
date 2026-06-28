# nudge

**The reminder you can't ignore.**

Nudge is a self-hosted AI study buddy that texts you on iMessage. Tell it what's due, and it'll hound you until you do it — built specifically for people with real ADHD.

---

## What it does

You text it like a friend. It handles the rest.

```
You:   i have a bio exam friday at 8am
Nudge: bio exam friday 8am — want me to really nag you on this one or just a single reminder?
You:   nag me lol
Nudge: locked in. i'll start blowing up your phone thursday morning. you asked for this 😤
```

When reminder time hits, Nudge texts you. If you don't reply, it escalates — 5 texts, 30 seconds apart, getting progressively more unhinged. It stops the moment you respond.

---

## Features

- **iMessage native** — shows up where your friends do. Blue bubbles, typing indicators, the whole thing.
- **Persistent nag mode** — 5 escalating texts, 30 seconds apart. Stops when you reply.
- **Natural language** — "remind me to submit my essay tomorrow at noon" just works.
- **One-off reminders** — not just assignments. "remind me to take my meds in 20 minutes" works too.
- **Multiple personalities** — Coach, Snarky, or Anxious. Pick your vibe.
- **Web dashboard** — see your assignments, pick your persona, mark things done.
- **OTP login** — sign into the dashboard via a code Nudge texts you. No passwords.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend / API | Next.js 15 (App Router) |
| Database | PostgreSQL via Prisma 7 |
| Job queue | BullMQ + Redis |
| iMessage bridge | BlueBubbles |
| AI | Anthropic API |
| Auth | JWT via jose |
| Infrastructure | Docker (Postgres + Redis) |

---

## How it works

```
iMessage → BlueBubbles → Webhook → Next.js API → AI Agent → BlueBubbles → iMessage
                                                      ↓
                                               BullMQ Queue
                                                      ↓
                                            Worker (scheduled reminders)
```

1. User texts the iMessage address
2. BlueBubbles fires a webhook to the Next.js server
3. The AI agent parses the message, calls tools (add assignment, set reminder, etc.)
4. Reminders are scheduled in BullMQ/Redis
5. When a reminder fires, the worker generates a message and sends it back via BlueBubbles

---

## Requirements

- A Mac (always-on) running [BlueBubbles](https://bluebubbles.app) with an Apple ID
- SIP disabled + BlueBubbles Private API enabled (for typing indicators)
- Node.js 20+
- Docker (for Postgres + Redis)
- An Anthropic API key

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/Skirozik/nudge.git
cd nudge
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```env
# Database
DATABASE_URL=postgresql://nudge:nudge@localhost:5432/nudge

# Redis
REDIS_URL=redis://localhost:6379

# BlueBubbles (your Mac's local IP)
BLUEBUBBLES_URL=http://192.168.1.x:1234
BLUEBUBBLES_PASSWORD=your_password
BLUEBUBBLES_METHOD=private-api

# Webhook security
WEBHOOK_SECRET=generate_a_random_string_here

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Session signing
SESSION_SECRET=generate_another_random_string_here
```

### 3. Start infrastructure

```bash
docker compose up -d
```

### 4. Run database migrations

```bash
npx prisma migrate deploy
npx prisma generate
```

### 5. Start the app

Open two terminals:

```bash
# Terminal 1 — Next.js server
npm run dev

# Terminal 2 — reminder worker
npm run worker
```

### 6. Configure BlueBubbles

In BlueBubbles Settings → API → Webhooks, add:

```
http://YOUR_LOCAL_IP:3000/api/webhook/bluebubbles?secret=YOUR_WEBHOOK_SECRET
```

Enable **All Events**.

---

## Project structure

```
nudge/
├── prisma/
│   └── schema.prisma          # Database models
├── src/
│   ├── app/
│   │   ├── page.tsx           # Landing page
│   │   ├── login/             # OTP login flow
│   │   ├── dashboard/         # User dashboard
│   │   └── api/
│   │       ├── webhook/       # BlueBubbles webhook handler
│   │       ├── auth/          # send-otp, verify-otp, logout
│   │       └── dashboard/     # assignments + user API
│   ├── lib/
│   │   ├── agent.ts           # AI agent + tool execution
│   │   ├── bluebubbles.ts     # iMessage send + typing indicator
│   │   ├── queue.ts           # BullMQ job scheduling
│   │   ├── session.ts         # JWT auth helpers
│   │   └── timezone.ts        # Timezone resolution
│   ├── worker/
│   │   └── index.ts           # Background reminder worker
│   └── middleware.ts          # Route protection
├── docker-compose.yml
└── Dockerfile
```

---

## Nudge modes

| Mode | Behavior |
|---|---|
| **Basic** | One reminder at the scheduled time |
| **Persistent** | 5 texts, 30 seconds apart, with escalating energy. Stops the moment you reply. |

---

## Personas

| Persona | Vibe |
|---|---|
| **Coach** | Warm, supportive, gets things done |
| **Snarky** | Dry humor, calls you out, still shows up |
| **Anxious** | Stressed on your behalf, endearingly flustered |

Change yours anytime in the dashboard or just tell Nudge.

---

## Dashboard

Visit `http://localhost:3000` while the server is running.

- `/` — landing page
- `/login` — sign in via iMessage OTP
- `/dashboard` — your assignments, persona picker, mark done

---

## Important notes

- **Never run two worker processes simultaneously.** The second one will pick up jobs from the first, causing duplicate sends.
- **After `prisma generate`, fully restart the dev server** — hot reload doesn't pick up generated client changes.
- **BlueBubbles webhook** may need to be re-saved in Settings after server downtime.
- **Add Nudge to your Do Not Disturb allowed contacts** so reminders get through even when your phone is in focus mode.

---

## Roadmap

- [ ] Voice call escalation via Twilio (if 5 texts aren't enough)
- [ ] Syllabus screenshot parsing — photo your syllabus, Nudge extracts all assignments
- [ ] Web dashboard: timezone settings, message history
- [ ] Multi-instance support for scale (multiple BlueBubbles instances)

---

## License

MIT
