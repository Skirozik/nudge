import type Anthropic from '@anthropic-ai/sdk'
import { prisma } from './prisma'

// The agent's memory of a chat. After a quiet spell it starts over, so a reply
// is never read against messages from weeks ago.

/** How long a chat can go quiet before the agent starts it fresh */
export const CONVERSATION_RESET_MS = 30 * 60 * 1000

type StoredMessage = { role: string; content: unknown }

/** The saved messages, or none if the chat has gone quiet */
export function freshHistory(
  convo: { messages: unknown; updatedAt: Date } | null,
  now: Date = new Date()
): StoredMessage[] {
  if (!convo || convo.updatedAt.getTime() < now.getTime() - CONVERSATION_RESET_MS) return []
  return (convo.messages ?? []) as StoredMessage[]
}

/**
 * Adds a text the bot sent on its own (an alert, a reminder, a broadcast) so
 * the agent knows about it when they reply. A quiet chat starts over first:
 * appending to it would refresh its timestamp and bring its old messages back
 * into the next reply, like a watch from last semester read as still on.
 */
export async function appendAssistantMessage(userId: string, message: string): Promise<void> {
  const existing = await prisma.conversation.findUnique({ where: { userId } })
  const messages = [...freshHistory(existing), { role: 'assistant', content: message }]
  await prisma.conversation.upsert({
    where: { userId },
    update: { messages: messages as object[] },
    create: { userId, messages: messages as object[] },
  })
}

/** The API needs a user turn first, and a chat the bot started opens with its own text */
export function startWithUser(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages[0]?.role !== 'assistant') return messages
  return [{ role: 'user', content: '(start of conversation)' }, ...messages]
}
