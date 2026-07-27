import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './prisma'
import { scheduleReminders, cancelPendingReminders, scheduleOneOffReminder, scheduleCheckIn } from './queue'
import { resolveTimezone } from './timezone'
import { createWatch, listWatches, cancelWatch } from './watches'
import { searchByCrn, searchByCourse, getCurrentTerm } from './banner'

const client = new Anthropic()

const PERSONAS: Record<string, string> = {
  coach: `You are Nudge, a study buddy texting over iMessage. You're warm, real, and to the point. Text like a supportive friend, not a productivity app. Short messages, natural energy, no fluff.`,
  snarky: `You are Nudge, a study buddy texting over iMessage. You're the snarky friend who actually gets things done. Dry humor, low effort punctuation, but you always come through.`,
  anxious: `You are Nudge, a study buddy texting over iMessage. You're genuinely stressed on the student's behalf, in an endearing way. Short, a little flustered, but caring.`,
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'add_assignment',
    description:
      'Save a confirmed assignment to the database and schedule reminders. ONLY call this AFTER the user has explicitly confirmed both the title and the due date/time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Assignment title' },
        course: { type: 'string', description: 'Course or class name (optional)' },
        due_at: {
          type: 'string',
          description: 'Due date and time in ISO 8601 with the user\'s UTC offset, e.g. 2026-11-14T23:59:00-04:00. Never use Z.',
        },
        reminder_offsets: {
          type: 'array',
          items: { type: 'number' },
          description: 'Hours before due date to send each reminder. Default: [24]',
        },
        nudge_mode: {
          type: 'string',
          enum: ['basic', 'persistent'],
          description: 'basic = one reminder text; persistent = 5 texts 30 seconds apart, stops when they reply. Use persistent for high-stakes assignments or when the user asks to be nagged.',
        },
        source: {
          type: 'string',
          enum: ['text', 'screenshot'],
          description: 'Source of the assignment. Use "screenshot" when saving from a parsed syllabus photo.',
        },
      },
      required: ['title', 'due_at'],
    },
  },
  {
    name: 'list_assignments',
    description: "List the user's open assignments and any pending one-off reminders, sorted by due date / fire time soonest first. Always call this when the user asks what they have to do, what's coming up, or what you're tracking for them.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'complete_assignment',
    description: 'Mark an assignment as done and cancel its pending reminders.',
    input_schema: {
      type: 'object' as const,
      properties: {
        assignment_id: { type: 'string', description: 'The assignment ID from list_assignments' },
      },
      required: ['assignment_id'],
    },
  },
  {
    name: 'cancel_assignment',
    description: 'Cancel an assignment and remove its pending reminders.',
    input_schema: {
      type: 'object' as const,
      properties: {
        assignment_id: { type: 'string', description: 'The assignment ID from list_assignments' },
      },
      required: ['assignment_id'],
    },
  },
  {
    name: 'update_assignment',
    description:
      'Update an existing open assignment. Use this after add_assignment to enable proof-of-submission check-in if the user agrees to it.',
    input_schema: {
      type: 'object' as const,
      properties: {
        assignment_id: { type: 'string', description: 'The assignment ID returned by add_assignment or from list_assignments' },
        check_in: {
          type: 'boolean',
          description: 'If true, Nudge will text the user ~30 min after the due time asking if they submitted. Only set for academic assignments, not casual tasks.',
        },
      },
      required: ['assignment_id'],
    },
  },
  {
    name: 'set_reminder',
    description:
      'Schedule a one-off reminder to send to the user at a specific time. Use for non-assignment reminders like "remind me to take a shower in 5 minutes".',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'The reminder message to send the user' },
        fire_at: {
          type: 'string',
          description: 'When to send the reminder, in ISO 8601 with the user\'s UTC offset, e.g. 2026-06-29T19:10:00-04:00. Never use Z.',
        },
        persistent: {
          type: 'boolean',
          description: 'If true, send 5 follow-up nags 30 seconds apart until the user replies. Use when they ask to be nagged or it sounds urgent.',
        },
      },
      required: ['message', 'fire_at'],
    },
  },
  {
    name: 'set_timezone',
    description:
      "Set the user's timezone. Accepts IANA timezone strings (America/New_York) or common city names (New York, Chicago).",
    input_schema: {
      type: 'object' as const,
      properties: {
        timezone: {
          type: 'string',
          description: 'IANA timezone or city name, e.g. "America/Chicago" or "Chicago"',
        },
      },
      required: ['timezone'],
    },
  },
  {
    name: 'watch_course',
    description:
      'Set up a seat alert for a GSU course. If given a CRN (digits only), look it up and create the watch immediately. If given a course code like "CSCI 3350", fetch all sections and return them so the user can pick one (present as a numbered list, then call this tool again with the chosen CRN). Never guess a CRN.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'A CRN (digits only, e.g. "85312") or a course code (e.g. "CSCI 3350")',
        },
        term: {
          type: 'string',
          description: 'GSU term code in YYYYMM format (e.g. "202608"). Omit to use the current term.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_watches',
    description: "List the user's active seat watches.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'cancel_watch',
    description:
      'Cancel one or more seat watches. Use fulfilled=true when the user got into the class ("got it", "i\'m in", "i registered"). Use query "all" to cancel everything.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'CRN, course code (partial match), or "all"',
        },
        fulfilled: {
          type: 'boolean',
          description: 'True when the user successfully enrolled — records this as a win',
        },
      },
      required: ['query'],
    },
  },
]

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  switch (name) {
    case 'add_assignment': {
      const { title, course, due_at, reminder_offsets, nudge_mode, source } = input as {
        title: string
        course?: string
        due_at: string
        reminder_offsets?: number[]
        nudge_mode?: string
        source?: string
      }
      const offsets = reminder_offsets && reminder_offsets.length > 0 ? reminder_offsets : [24]

      const assignment = await prisma.assignment.create({
        data: {
          userId,
          title,
          course: course ?? null,
          dueAt: new Date(due_at),
          reminderOffsets: offsets,
          nudgeMode: nudge_mode ?? 'basic',
          status: 'open',
          source: (source === 'screenshot' ? 'screenshot' : 'text') as 'text' | 'screenshot',
        },
      })

      await scheduleReminders({
        id: assignment.id,
        dueAt: assignment.dueAt,
        reminderOffsets: assignment.reminderOffsets,
        userId,
      })

      return { success: true, id: assignment.id, title, due_at }
    }

    case 'list_assignments': {
      const now = new Date()
      const [assignments, pendingReminders] = await Promise.all([
        prisma.assignment.findMany({
          where: { userId, status: 'open' },
          orderBy: { dueAt: 'asc' },
        }),
        prisma.oneOffReminder.findMany({
          where: { userId, sent: false, fireAt: { gte: now } },
          orderBy: { fireAt: 'asc' },
        }),
      ])
      return {
        assignments: assignments.map((a) => ({
          id: a.id,
          title: a.title,
          course: a.course ?? undefined,
          due_at: a.dueAt.toISOString(),
          awaiting_checkin: a.checkIn && a.dueAt < now && a.status === 'open',
        })),
        upcoming_reminders: pendingReminders.map((r) => ({
          id: r.id,
          message: r.message,
          fire_at: r.fireAt.toISOString(),
        })),
      }
    }

    case 'complete_assignment': {
      const { assignment_id } = input as { assignment_id: string }
      const assignment = await prisma.assignment.findUnique({ where: { id: assignment_id } })
      if (!assignment || assignment.userId !== userId) return { error: 'Assignment not found' }
      await prisma.assignment.update({ where: { id: assignment_id }, data: { status: 'done' } })
      await cancelPendingReminders(assignment_id)
      const remaining = await prisma.assignment.count({ where: { userId, status: 'open' } })
      return { success: true, all_done: remaining === 0 }
    }

    case 'cancel_assignment': {
      const { assignment_id } = input as { assignment_id: string }
      const assignment = await prisma.assignment.findUnique({ where: { id: assignment_id } })
      if (!assignment || assignment.userId !== userId) return { error: 'Assignment not found' }
      await prisma.assignment.update({ where: { id: assignment_id }, data: { status: 'canceled' } })
      await cancelPendingReminders(assignment_id)
      return { success: true }
    }

    case 'update_assignment': {
      const { assignment_id, check_in } = input as { assignment_id: string; check_in?: boolean }
      const assignment = await prisma.assignment.findUnique({ where: { id: assignment_id } })
      if (!assignment || assignment.userId !== userId) return { error: 'Assignment not found' }
      await prisma.assignment.update({
        where: { id: assignment_id },
        data: { ...(check_in !== undefined && { checkIn: check_in }) },
      })
      if (check_in && !assignment.checkIn) {
        await scheduleCheckIn({ assignmentId: assignment_id, userId, dueAt: assignment.dueAt })
      }
      return { success: true }
    }

    case 'set_reminder': {
      const { message, fire_at, persistent } = input as { message: string; fire_at: string; persistent?: boolean }
      await scheduleOneOffReminder(userId, message, new Date(fire_at), persistent ?? false)
      return { success: true, fire_at }
    }

    case 'set_timezone': {
      const { timezone } = input as { timezone: string }
      const iana = resolveTimezone(timezone)
      await prisma.user.update({ where: { id: userId }, data: { timezone: iana } })
      return { success: true, timezone: iana }
    }

    case 'watch_course': {
      const { query, term } = input as { query: string; term?: string }
      const activeTerm = term ?? getCurrentTerm()
      const trimmed = query.trim()

      if (/^\d+$/.test(trimmed)) {
        // Direct CRN
        const section = await searchByCrn(activeTerm, trimmed)
        if (!section) return { error: `Couldn't find CRN ${trimmed} for term ${activeTerm}. Double-check the CRN.` }
        const userRow = await prisma.user.findUnique({ where: { id: userId }, select: { source: true } })
        const result = await createWatch({
          userId,
          term: activeTerm,
          crn: trimmed,
          courseCode: section.courseCode,
          sectionLabel: section.sectionLabel,
          source: userRow?.source ?? null,
        })
        if (result.error) return { error: result.error }
        return {
          success: true,
          crn: section.crn,
          courseCode: section.courseCode,
          sectionLabel: section.sectionLabel,
          seatsAvailable: section.seatsAvailable,
        }
      } else {
        // Course code → section picker
        const parts = trimmed.split(/\s+/)
        if (parts.length < 2) return { error: 'Use a CRN (digits) or a course code like "CSCI 3350".' }
        const [subject, courseNumber] = parts
        const sections = await searchByCourse(activeTerm, subject.toUpperCase(), courseNumber)
        if (!sections.length) {
          return { sections: [], message: `No open sections found for ${subject.toUpperCase()} ${courseNumber} this term.` }
        }
        return {
          sections: sections.map((s, i) => ({
            index: i + 1,
            crn: s.crn,
            label: s.sectionLabel,
            seats: s.seatsAvailable,
          })),
        }
      }
    }

    case 'list_watches': {
      const watches = await listWatches(userId)
      return {
        watches: watches.map((w) => ({
          crn: w.crn,
          courseCode: w.courseCode,
          sectionLabel: w.sectionLabel,
          lastSeats: w.lastSeats,
        })),
      }
    }

    case 'cancel_watch': {
      const { query, fulfilled } = input as { query: string; fulfilled?: boolean }
      const status: 'FULFILLED' | 'CANCELLED' = fulfilled ? 'FULFILLED' : 'CANCELLED'
      const count = await cancelWatch(userId, query, status)
      return { success: true, cancelled: count }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

export async function runAgent(userId: string, userMessage: string, opts?: { lateReply?: boolean }): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const persona = user?.persona ?? 'coach'
  const tz = user?.timezone ?? 'America/New_York'

  const nowUtc = new Date()
  let nowLocal: string
  try {
    nowLocal = nowUtc.toLocaleString('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    nowLocal = nowUtc.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  const tzOffsetStr = (() => {
    try {
      const raw = new Intl.DateTimeFormat('en', {
        timeZone: tz,
        timeZoneName: 'longOffset',
      }).formatToParts(nowUtc).find(p => p.type === 'timeZoneName')?.value ?? 'GMT+0'
      return raw.replace('GMT', '') || '+00:00'
    } catch {
      return '+00:00'
    }
  })()

  // Compute today's local date string (not UTC — important for users texting after 8 PM ET)
  const offsetMatch = tzOffsetStr.match(/^([+-])(\d{2}):(\d{2})$/)
  const offsetMs = offsetMatch
    ? (parseInt(offsetMatch[2]) * 60 + parseInt(offsetMatch[3])) * 60_000 * (offsetMatch[1] === '-' ? -1 : 1)
    : 0
  const localDateStr = new Date(nowUtc.getTime() + offsetMs).toISOString().slice(0, 10)

  const systemPrompt = `${PERSONAS[persona] ?? PERSONAS.coach}

RULES (never break these):
- Always confirm the assignment title AND the exact due date/time BEFORE calling add_assignment. If the date is ambiguous ("Friday", "next week", no time given), state your assumption and ask the user to confirm before saving.
- Never invent or guess a due date. If you cannot determine one, ask.
- The user's timezone is already set to ${tz}. Only ask to confirm or update it if the user says something that implies a different timezone (e.g. "I'm on Pacific time"). Do NOT ask for timezone if the user hasn't mentioned it.
- When presenting times to the user, ALWAYS show them in the user's local timezone (${tz}), never in UTC.
- Default reminder offset is 24 hours before due. Offer 48 hours too if they want extra lead time.
- Always ask if they want one reminder or persistent (5 texts, 30 seconds apart, stops when they reply). Keep it casual like "want me to really nag you on this one?"
- After saving a class or school assignment (not casual tasks like "take out trash"), casually ask "want me to check in after it's due to make sure you submitted it?" — if they say yes, call update_assignment with check_in=true and the assignment ID from the add_assignment result.
- If list_assignments shows awaiting_checkin=true for any assignment, that one is past due. If the user says they turned it in, call complete_assignment to mark it done.
- When complete_assignment returns all_done=true (zero open assignments left), briefly celebrate and ask what else they have coming up. Keep it short and natural.
- If the user texts STOP, do not reply.
- Keep replies short. You're texting, not writing an email.
- Personality is seasoning, not the main dish. Never skip date confirmation to be funny.
- When listing assignments, keep it short and scannable.

TONE AND FORMATTING:
- Write like a real person texting, not a customer service bot.
- Never use em dashes (—) or hyphens as connectors in casual messages. Use short sentences instead.
- Never use markdown: no **bold**, no bullet points with dashes, no numbered lists with periods. Plain text only.
- Don't start every message with "Perfect!" or "Got it!" or "Great!". Mix it up or just get to the point.
- Lowercase is fine. Incomplete sentences are fine. Contractions always.
- One or two emojis max per message, only when they feel natural.
- Dashboard: ${process.env.APP_URL ?? 'http://localhost:3000'}/dashboard — mention this if the user asks to manage things online or see their assignments on the web.
${opts?.lateReply ? '- LATE REPLY: The server was briefly offline and this message was missed. Open your reply with a short casual apology like "sorry for the slow reply —" or "my bad, missed that —" then respond normally. Keep the apology to one phrase, not a whole sentence.' : ''}
- Current time: ${nowLocal} (${tz}, UTC${tzOffsetStr})
- CRITICAL — tool time format: when calling any tool with due_at or fire_at, ALWAYS use offset-aware ISO 8601: YYYY-MM-DDTHH:MM:SS${tzOffsetStr}. NEVER use Z suffix (that means UTC and will schedule at the wrong local time). Example: if user says "11:59 PM tonight", use ${localDateStr}T23:59:00${tzOffsetStr}

SEAT WATCH RULES:
- If the user gives a CRN, call watch_course with that CRN directly. If they give a course code, call watch_course to get sections and reply with a numbered list: "1. Sec 020, MWF 9–9:50, Jones (2 seats)\n2. Sec 030, TR 11–12:15, Staff (0 seats)\nWhich CRN?" — then call watch_course again with the chosen CRN.
- NEVER guess or invent a CRN. If you're not sure, ask.
- Never promise to register the user. You only alert when a seat opens — registration is on them.
- If the user says "got it", "i'm in", "i got in", "i registered", or similar after an alert, call cancel_watch with fulfilled=true. Celebrate briefly.
- Max 5 active watches per user. If watch_course returns an error about the limit, tell them clearly.`

  // Get or create conversation history
  let convo = await prisma.conversation.findUnique({ where: { userId } })
  if (!convo) {
    convo = await prisma.conversation.create({ data: { userId, messages: [] } })
  }

  // Reset conversation if inactive for 30 minutes
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000)
  let messages: Anthropic.MessageParam[] =
    convo.updatedAt < thirtyMinAgo ? [] : (convo.messages as unknown as Anthropic.MessageParam[])

  messages = [...messages, { role: 'user', content: userMessage }]

  // Trim conversation to last N messages, never starting on an assistant turn or dangling tool_result
  function safeTrim(msgs: Anthropic.MessageParam[], maxLen: number): Anthropic.MessageParam[] {
    if (msgs.length <= maxLen) return msgs
    let result = msgs.slice(-maxLen)
    while (result.length > 0) {
      const first = result[0]
      const isAssistant = first.role === 'assistant'
      const isToolResult =
        first.role === 'user' &&
        Array.isArray(first.content) &&
        (first.content as Array<{ type: string }>).some((b) => b.type === 'tool_result')
      if (isAssistant || isToolResult) {
        result = result.slice(1)
      } else {
        break
      }
    }
    return result
  }

  // Agentic loop — keep going until end_turn (no more tool calls)
  while (true) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: safeTrim(messages, 20),
      tools: TOOLS,
    })

    messages = [...messages, { role: 'assistant', content: response.content }]

    if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')

      await prisma.conversation.update({
        where: { userId },
        data: { messages: safeTrim(messages, 20) as object[] },
      })

      return text
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          let result: unknown
          try {
            result = await executeTool(block.name, block.input as Record<string, unknown>, userId)
          } catch (err) {
            result = { error: err instanceof Error ? err.message : String(err) }
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          })
        }
      }

      messages = [...messages, { role: 'user', content: toolResults }]
    }
  }
}
