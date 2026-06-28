import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './prisma'
import { scheduleReminders, cancelPendingReminders, scheduleOneOffReminder, scheduleFollowUp } from './queue'
import { resolveTimezone } from './timezone'

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
          description: 'Due date and time in ISO 8601 UTC format, e.g. 2026-11-14T23:59:00Z',
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
      },
      required: ['title', 'due_at'],
    },
  },
  {
    name: 'list_assignments',
    description: "List the user's open assignments, sorted by due date soonest first.",
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
    name: 'set_reminder',
    description:
      'Schedule a one-off reminder to send to the user at a specific time. Use for non-assignment reminders like "remind me to take a shower in 5 minutes".',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'The reminder message to send the user' },
        fire_at: {
          type: 'string',
          description: 'When to send the reminder, in ISO 8601 UTC format',
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
]

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  switch (name) {
    case 'add_assignment': {
      const { title, course, due_at, reminder_offsets, nudge_mode } = input as {
        title: string
        course?: string
        due_at: string
        reminder_offsets?: number[]
        nudge_mode?: string
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
          source: 'text',
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
      const assignments = await prisma.assignment.findMany({
        where: { userId, status: 'open' },
        orderBy: { dueAt: 'asc' },
      })
      if (assignments.length === 0) return []
      return assignments.map((a) => ({
        id: a.id,
        title: a.title,
        course: a.course ?? undefined,
        due_at: a.dueAt.toISOString(),
      }))
    }

    case 'complete_assignment': {
      const { assignment_id } = input as { assignment_id: string }
      await prisma.assignment.update({
        where: { id: assignment_id },
        data: { status: 'done' },
      })
      await cancelPendingReminders(assignment_id)
      return { success: true }
    }

    case 'cancel_assignment': {
      const { assignment_id } = input as { assignment_id: string }
      await prisma.assignment.update({
        where: { id: assignment_id },
        data: { status: 'canceled' },
      })
      await cancelPendingReminders(assignment_id)
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

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

export async function runAgent(userId: string, userMessage: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const persona = user?.persona ?? 'coach'

  const systemPrompt = `${PERSONAS[persona] ?? PERSONAS.coach}

RULES (never break these):
- Always confirm the assignment title AND the exact due date/time BEFORE calling add_assignment. If the date is ambiguous ("Friday", "next week", no time given), state your assumption and ask the user to confirm before saving.
- Never invent or guess a due date. If you cannot determine one, ask.
- If the user's timezone is not yet set, ask for it before parsing any assignment. Accept city names like "New York" or "Chicago".
- Default reminder offset is 24 hours before due. Offer 48 hours too if they want extra lead time.
- Always ask if they want one reminder or persistent (5 texts, 30 seconds apart, stops when they reply). Keep it casual like "want me to really nag you on this one?"
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
- Current UTC time: ${new Date().toISOString()}`

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
  if (messages.length > 20) messages = messages.slice(-20)

  // Agentic loop — keep going until end_turn (no more tool calls)
  while (true) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      tools: TOOLS,
    })

    messages = [...messages, { role: 'assistant', content: response.content }]

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')

      await prisma.conversation.update({
        where: { userId },
        data: { messages: messages as object[] },
      })

      return text
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>,
            userId
          )
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
