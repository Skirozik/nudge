import Anthropic from '@anthropic-ai/sdk'
import heicConvert from 'heic-convert'

export interface ExtractedAssignment {
  title: string
  course: string | null
  dueAt: string | null
}

const client = new Anthropic()

export async function parseSyllabusImage(
  buffer: Buffer,
  mimeType: string,
  userTimezone: string
): Promise<ExtractedAssignment[]> {
  let imageBuffer = buffer
  let imageMime = mimeType

  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    try {
      const converted = await heicConvert({ buffer: buffer as unknown as Parameters<typeof heicConvert>[0]['buffer'], format: 'JPEG', quality: 0.9 })
      imageBuffer = Buffer.from(converted)
      imageMime = 'image/jpeg'
    } catch {
      return []
    }
  }

  const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!supported.includes(imageMime)) return []

  const today = new Date().toLocaleDateString('en-US', {
    timeZone: userTimezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const base64 = imageBuffer.toString('base64')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imageMime as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: base64,
            },
          },
          {
            type: 'text',
            text: `Extract all assignments, homework, exams, quizzes, and projects from this syllabus or course schedule image.

Today is ${today}. The user's timezone is ${userTimezone}.

Return ONLY a JSON array with no explanation, no markdown, no code fences. Each item must have:
- "title": short descriptive name of the assignment (string)
- "course": course name or code if visible, otherwise null
- "dueAt": due date/time as ISO 8601 UTC string (e.g. "2026-09-15T23:59:00Z"), or null if the date is unclear or missing

If no assignments are found, return an empty array [].

Example: [{"title":"Midterm Exam","course":"BIO 101","dueAt":"2026-10-15T17:00:00Z"}]`,
          },
        ],
      },
    ],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  try {
    const parsed = JSON.parse(text.trim())
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is ExtractedAssignment =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.title === 'string'
    )
  } catch {
    return []
  }
}
