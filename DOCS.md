# Nudge — Full Project Documentation

## Table of Contents
1. [What is Nudge](#what-is-nudge)
2. [How It Works](#how-it-works)
3. [Architecture](#architecture)
4. [Database Schema](#database-schema)
5. [File Structure](#file-structure)
6. [Features](#features)
7. [API Routes](#api-routes)
8. [AI Agent](#ai-agent)
9. [Worker & Job Queue](#worker--job-queue)
10. [Auth System](#auth-system)
11. [Local Development](#local-development)
12. [Production Deployment](#production-deployment)
13. [Environment Variables](#environment-variables)
14. [Known Gotchas](#known-gotchas)
15. [Roadmap](#roadmap)

---

## What is Nudge

Nudge is a self-hosted AI study buddy that communicates entirely through iMessage. Users text a dedicated iCloud address in natural language ("I have a bio exam Friday at 8am, nag me"), and Nudge schedules reminders, tracks assignments, and follows up with escalating texts until they respond.

Built specifically for people with ADHD — the product premise is that a reminder that shows up in your iMessage thread, from a "friend" who keeps texting you, is harder to ignore than a push notification from an app.

---

## How It Works

```
User texts hinudge@icloud.com
        ↓
BlueBubbles (Mac) receives iMessage
        ↓
Fires webhook → Vercel (Next.js API)
        ↓
Dedup check → Typing indicator sent
        ↓
AI Agent (Anthropic) parses message
        ↓
Tool called (add assignment, set reminder, etc.)
        ↓
Data saved to Neon (Postgres)
Job scheduled in Upstash (Redis via BullMQ)
        ↓
Agent generates reply → BlueBubbles sends iMessage
        ↓
[Later] Worker fires scheduled job
        ↓
Generates reminder message → BlueBubbles sends iMessage
        ↓
[If persistent] 5 follow-up texts, 30s apart, until user replies
```

---

## Architecture

### Infrastructure

| Service | Role | Hosting |
|---|---|---|
| Next.js 15 | Web server, API routes, dashboard | Vercel |
| PostgreSQL | Primary database | Neon (free tier) |
| Redis + BullMQ | Job queue for scheduled reminders | Upstash (free tier) |
| BlueBubbles | iMessage bridge (Mac app) | Local Mac |
| Cloudflare Tunnel | Exposes BlueBubbles to public internet | Cloudflare (free) |
| Worker (Node.js) | Processes scheduled reminder jobs | Local machine |

### Key Design Decisions

**Why BlueBubbles?**
Apple doesn't provide an iMessage API. BlueBubbles is an open-source Mac app that reverse-engineers the Messages.app AppleScript/Private API and exposes a REST API + webhooks. It requires a Mac running macOS.

**Why local worker?**
BullMQ workers are persistent processes — they hold open connections and listen for jobs. Vercel is serverless (functions die after each request). The worker must run as a persistent process somewhere that can reach BlueBubbles. For now, it runs on the developer's machine. Future: deploy to Railway or Fly.io alongside a Cloudflare Tunnel URL for BlueBubbles.

**Why Neon + Upstash instead of local Docker?**
Vercel (cloud) and the local worker both need to access the same database and Redis instance. Local Docker is only reachable on the developer's machine. Neon and Upstash are cloud-hosted and accessible from anywhere.

**Why JWT sessions instead of NextAuth?**
The auth flow is phone number → OTP via iMessage → session. No OAuth providers, no email. Rolling a minimal JWT-based session with `jose` is simpler and has no external dependencies.

---

## Database Schema

```prisma
model User {
  id           String        @id @default(uuid())
  phone        String        @unique        // iMessage address or phone number
  timezone     String        @default("America/New_York")
  persona      String        @default("coach")  // coach | snarky | anxious
  createdAt    DateTime      @default(now())
  optedOut     Boolean       @default(false)
  assignments  Assignment[]
  conversation Conversation?
  messages     Message[]
  sessions     Session[]
}

model Assignment {
  id              String     @id @default(uuid())
  userId          String
  title           String
  course          String?
  dueAt           DateTime
  reminderOffsets Int[]      @default([24])  // hours before due
  nudgeMode       String     @default("basic")  // basic | persistent
  status          Status     @default(open)     // open | done | canceled
  source          Source     @default(text)     // text | screenshot (future)
  createdAt       DateTime   @default(now())
  reminders       Reminder[]
}

model Reminder {
  id           String     @id @default(uuid())
  assignmentId String
  sendAt       DateTime
  sent         Boolean    @default(false)
  sentAt       DateTime?
  bullmqJobId  String?    // tracks the BullMQ job for cancellation
}

model Conversation {
  id        String   @id @default(uuid())
  userId    String   @unique
  messages  Json     @default("[]")  // Anthropic MessageParam[] stored as JSON
  updatedAt DateTime @updatedAt      // used for 30-min reset logic
}

model Message {
  id        String    @id @default(uuid())
  userId    String
  direction Direction  // in | out
  body      String
  createdAt DateTime   @default(now())
}

// Used to check if user replied (stops persistent nag mode)
// Worker queries: Message where userId=X, direction=in, createdAt >= sentAfter

model OtpCode {
  id        String   @id @default(uuid())
  phone     String
  code      String   // 6-digit numeric
  expiresAt DateTime  // 10 minutes from creation
  used      Boolean  @default(false)
}

model Session {
  id        String   @id @default(uuid())
  userId    String
  token     String   @unique @default(uuid())
  expiresAt DateTime
}
```

---

## File Structure

```
nudge/
├── prisma/
│   ├── schema.prisma              # All database models
│   └── migrations/                # Migration history
│       ├── 20260627233159_init/
│       ├── 20260628005927_add_nudge_mode/
│       └── 20260628034418_add_otp_session/
│
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── layout.tsx             # Root layout + metadata
│   │   ├── page.tsx               # Landing page (/)
│   │   │
│   │   ├── login/
│   │   │   └── page.tsx           # Phone + OTP login (/login)
│   │   │
│   │   ├── dashboard/
│   │   │   ├── page.tsx           # Server component — fetches data, checks auth
│   │   │   └── DashboardClient.tsx # Client component — interactive UI
│   │   │
│   │   └── api/
│   │       ├── webhook/
│   │       │   └── bluebubbles/
│   │       │       └── route.ts   # Receives iMessage events from BlueBubbles
│   │       ├── auth/
│   │       │   ├── send-otp/route.ts    # Sends OTP via iMessage
│   │       │   ├── verify-otp/route.ts  # Verifies OTP, sets session cookie
│   │       │   └── logout/route.ts      # Clears session cookie
│   │       └── dashboard/
│   │           ├── assignments/route.ts # GET (list) + PATCH (done/canceled)
│   │           └── me/route.ts          # GET + PATCH user profile
│   │
│   ├── lib/
│   │   ├── agent.ts               # AI agent: system prompt, tools, agentic loop
│   │   ├── bluebubbles.ts         # sendMessage() + sendTypingIndicator()
│   │   ├── prisma.ts              # Prisma client singleton
│   │   ├── queue.ts               # BullMQ: scheduleReminders, scheduleFollowUp, etc.
│   │   ├── session.ts             # JWT creation, verification, cookie helpers
│   │   └── timezone.ts            # IANA timezone resolution + social hours shift
│   │
│   ├── worker/
│   │   └── index.ts               # BullMQ worker: processes send-reminder,
│   │                              #   send-one-off, send-followup jobs
│   │
│   └── middleware.ts              # Protects /dashboard — redirects to /login if no session
│
├── docker-compose.yml             # Local dev only: Postgres + Redis
├── Dockerfile                     # Used by docker-compose (not Vercel)
├── vercel.json                    # Function duration overrides
├── prisma.config.ts               # Prisma config (adapter-pg, no URL in schema)
├── .env                           # Local secrets (gitignored)
└── .env.example                   # Template for new developers
```

---

## Features

### iMessage Integration
- Users text a dedicated iCloud address (`hinudge@icloud.com`)
- BlueBubbles proxies inbound messages as webhooks to the Next.js server
- Outbound messages sent via BlueBubbles REST API
- Typing indicators via BlueBubbles Private API (requires SIP disabled on Mac)
- Webhook deduplication — BlueBubbles fires each event twice; handled with an in-memory GUID Set with 5-min TTL

### AI Agent
The agent runs in an agentic loop (multi-turn tool use) powered by Anthropic. It has 6 tools:

| Tool | Description |
|---|---|
| `add_assignment` | Saves assignment + schedules reminders |
| `list_assignments` | Lists open assignments sorted by due date |
| `complete_assignment` | Marks done + cancels pending reminders |
| `cancel_assignment` | Cancels assignment + pending reminders |
| `set_reminder` | One-off reminder (e.g. "remind me to shower in 5 mins") |
| `set_timezone` | Sets user timezone (accepts city names) |

**Rules the agent follows:**
- Always confirms title AND due date before calling `add_assignment`
- Never invents a due date
- Asks for timezone before parsing any date if not set
- Always asks if user wants basic or persistent reminders
- Conversation resets after 30 minutes of inactivity

### Personas
Three AI personalities, selectable via dashboard or text:

| Persona | Character |
|---|---|
| **Coach** | Warm, supportive, like a study buddy friend |
| **Snarky** | Dry humor, calls you out, still gets things done |
| **Anxious** | Genuinely stressed on your behalf, endearingly flustered |

### Nudge Modes
| Mode | Behavior |
|---|---|
| **Basic** | One reminder text at scheduled time |
| **Persistent** | Initial text + 5 follow-ups at 30-second intervals. Each follow-up escalates in tone (from casual check-in to full drama). Stops immediately if user replies to any message. |

### Persistent Nag Escalation
```
#1 — Mild: "hey did you see my last text?" energy
#2 — Noticed: "They definitely saw it and are ignoring you" energy
#3 — Full nag: Short, punchy, dramatic
#4 — Personally offended: Funny but relentless
#5 — Final text: Full drama queen, last chance energy
```

### Onboarding
New users (first message ever) automatically receive a DND tip after the agent's first reply:
> "💡 Quick tip: add me to your allowed contacts so reminders get through even on Do Not Disturb → Settings › Focus › Do Not Disturb › People › Add."

### Dashboard
- **Login**: Phone number → 6-digit OTP sent via iMessage → JWT session cookie (30 days)
- **Assignments**: List all open assignments with due date, nudge mode, next reminder time
- **Mark done**: One click to complete and cancel pending reminders
- **Persona picker**: Switch between Coach / Snarky / Anxious, saves immediately

---

## API Routes

### Public
| Route | Method | Description |
|---|---|---|
| `/api/webhook/bluebubbles` | POST | Receives iMessage events. Requires `?secret=WEBHOOK_SECRET` |

### Auth
| Route | Method | Description |
|---|---|---|
| `/api/auth/send-otp` | POST | Sends OTP to phone via iMessage. Body: `{ phone }` |
| `/api/auth/verify-otp` | POST | Verifies OTP, sets session cookie. Body: `{ phone, code }` |
| `/api/auth/logout` | POST | Clears session cookie |

### Dashboard (requires session cookie)
| Route | Method | Description |
|---|---|---|
| `/api/dashboard/assignments` | GET | List open assignments |
| `/api/dashboard/assignments` | PATCH | Update status. Body: `{ id, status: "done" \| "canceled" }` |
| `/api/dashboard/me` | GET | Get user profile |
| `/api/dashboard/me` | PATCH | Update persona or timezone. Body: `{ persona?, timezone? }` |

---

## AI Agent

**File**: `src/lib/agent.ts`

The agent runs a `while(true)` loop calling the Anthropic API until `stop_reason === 'end_turn'`. Each iteration either:
- Returns a text response (end of turn)
- Calls tools (executes them, feeds results back into the next API call)

**Conversation history** is stored in the `Conversation` table as a JSON array of `Anthropic.MessageParam[]`. It's trimmed to the last 20 messages and reset after 30 minutes of inactivity.

**System prompt** includes:
- Persona (coach / snarky / anxious)
- Hard rules (never guess due dates, confirm before saving, etc.)
- Tone and formatting rules (no em dashes, no markdown, vary openings, lowercase ok)
- Current UTC time (injected at runtime so the agent can parse relative dates)

---

## Worker & Job Queue

**File**: `src/worker/index.ts`  
**Queue lib**: BullMQ with Upstash Redis

### Job Types

**`send-reminder`**
Fired by `scheduleReminders()` in `queue.ts`. Looks up the assignment's pending reminder, generates a message via Anthropic using the user's persona, sends via BlueBubbles. If `nudgeMode === 'persistent'`, schedules the first follow-up.

**`send-one-off`**
Fired by `scheduleOneOffReminder()`. Sends a one-off message. If `persistent === true`, schedules the first follow-up.

**`send-followup`**
Fired by `scheduleFollowUp()` with a 30-second delay. Checks if user has replied since `sentAfter` (queries `Message` table). If replied → stops. If not → generates escalating nag message, sends it, schedules next follow-up (up to 5 total).

### Startup Recovery
On worker start, queries all `Reminder` records where `sent: false` and `sendAt <= now`. Sends any missed reminders immediately. Also re-enqueues future reminders that lost their BullMQ job (e.g. after Redis was cleared).

### Social Hours Shifting
Reminders are shifted to "social hours" (8am–9pm in user's timezone) so Nudge doesn't text at 3am. Implemented in `src/lib/timezone.ts`.

---

## Auth System

**File**: `src/lib/session.ts`

Uses `jose` for JWT signing. Session token is a signed JWT with:
- `userId` payload
- 30-day expiry
- HS256 algorithm
- Secret from `SESSION_SECRET` env var

Stored as an httpOnly cookie named `nudge_session`. Middleware at `src/middleware.ts` verifies the JWT on every request to `/dashboard/*` and redirects to `/login` if invalid or missing.

OTP codes are 6-digit numeric strings, stored in the `OtpCode` table, expire in 10 minutes, single-use.

---

## Local Development

### Prerequisites
- Node.js 20+
- Docker (for local Postgres + Redis)
- BlueBubbles running on a Mac on the same network
- Anthropic API key

### Setup
```bash
git clone https://github.com/Skirozik/nudge.git
cd nudge
npm install
cp .env.example .env
# fill in .env values
docker compose up -d          # start Postgres + Redis
npx prisma migrate deploy
npx prisma generate
```

### Running
```bash
# Terminal 1
npm run dev          # Next.js on localhost:3000

# Terminal 2
npm run worker       # BullMQ worker
```

### Critical Rules
- **Never run two worker processes simultaneously.** The second picks up jobs from the first, causing duplicate sends.
- **After `npx prisma generate`, restart the dev server completely.** Hot reload does not pick up generated client changes.
- **After any server downtime, re-save the BlueBubbles webhook URL** in BlueBubbles Settings → Webhooks.

---

## Production Deployment

### Services
| Service | Free Tier | Used For |
|---|---|---|
| Vercel | Yes | Next.js app (landing page, dashboard, webhook API) |
| Neon | Yes | Cloud PostgreSQL |
| Upstash | Yes | Cloud Redis (BullMQ) |
| Cloudflare Tunnel | Yes | Exposes local BlueBubbles to internet |

### Vercel Environment Variables
```
DATABASE_URL        = Neon POOLED connection string (with -pooler in hostname)
REDIS_URL           = Upstash rediss:// URL
BLUEBUBBLES_URL     = Cloudflare Tunnel URL (https://xxx.trycloudflare.com)
BLUEBUBBLES_PASSWORD = BlueBubbles server password
BLUEBUBBLES_METHOD  = private-api
WEBHOOK_SECRET      = Random string (matches BlueBubbles webhook URL param)
ANTHROPIC_API_KEY   = Anthropic API key
SESSION_SECRET      = Random string for JWT signing
```

### Local Worker .env (after switching to cloud)
```
DATABASE_URL        = Neon DIRECT connection string (no -pooler)
REDIS_URL           = Upstash rediss:// URL
BLUEBUBBLES_URL     = Local Mac IP (http://192.168.1.x:1234) — worker is on same network
```

### Why Two Different DATABASE_URLs?
Vercel is serverless — each function invocation creates a new Postgres pool. The **pooled** Neon endpoint uses PgBouncer to prevent connection exhaustion. The local worker is a persistent process with a stable pool and can use the **direct** connection.

`prisma.ts` also sets `max: 1` connection per pool in production to limit serverless connections.

### Deploying Updates
```bash
git push origin master   # Vercel auto-deploys on push
```

Worker updates require restarting the local process manually.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string (use `rediss://` for TLS) |
| `BLUEBUBBLES_URL` | Yes | BlueBubbles server URL |
| `BLUEBUBBLES_PASSWORD` | Yes | BlueBubbles server password |
| `BLUEBUBBLES_METHOD` | Yes | `private-api` or `apple-script` |
| `WEBHOOK_SECRET` | Yes | Appended to webhook URL as `?secret=` |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `SESSION_SECRET` | Yes | JWT signing secret (any long random string) |

---

## Known Gotchas

**Typing indicators require SIP disabled**
BlueBubbles Private API (needed for typing indicators) requires System Integrity Protection to be disabled on the Mac running BlueBubbles. This is a one-time setup. Without it, typing indicators are silently skipped.

**Webhook fires twice**
BlueBubbles sends each `new-message` event twice. Handled with an in-memory GUID dedup cache with 5-minute TTL in the webhook handler.

**Stale Prisma client after schema changes**
Running `npx prisma generate` regenerates the client in `src/generated/prisma`. Next.js hot reload doesn't pick this up — requires a full server restart (`Ctrl+C` + `npm run dev`).

**Old Anthropic API key in .env**
The API key visible in the project's history was shared in a chat session and should be considered compromised. Rotate it at console.anthropic.com.

**iMessage only, no Android**
BlueBubbles bridges iMessage, not SMS. Android users can't use Nudge unless a Twilio SMS layer is added.

**One Mac = one Apple ID = one iMessage address**
Scaling beyond ~500 weekly active users may require multiple Mac Minis each with their own Apple ID, load-balanced.

---

## Roadmap

- [ ] **Voice call escalation** — if persistent nag doesn't work, Twilio calls the user and reads the reminder aloud
- [ ] **Syllabus screenshot parsing** — user photos their syllabus, Nudge extracts all assignments via vision AI
- [ ] **Dashboard v2** — timezone settings, message history, reminder history
- [ ] **Multi-instance support** — multiple BlueBubbles instances for scale
- [ ] **Custom domain** — branded URL (e.g. getnudge.app)
- [ ] **Android support via Twilio SMS** — optional channel for non-iPhone users
