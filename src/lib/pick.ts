/**
 * What a student came for: SeatSnipe, Nudge or both. A new number is asked on
 * its first text (src/lib/onboarding.ts). Afterwards the pick only settles
 * texts that could go either way; anyone can still use both.
 */
export type Product = 'seatsnipe' | 'nudge' | 'both'

export const PICK_QUESTION =
  'Hi! Are you here for SeatSnipe (get a text when a seat opens in a full class)\nor\nNudge (reminders for assignments and due dates)?'
export const PICK_REASK = 'SeatSnipe or Nudge?'
export const SEATSNIPE_WELCOME =
  "Got it! When I text you that a seat opened, register right away. Seats go fast and I can't hold one for you."
export const NUDGE_WELCOME =
  "i send you reminders for assignments and tasks so nothing slips through. just tell me what's due and i'll handle the rest."
export const DND_TIP =
  '💡 add me to your allowed contacts so messages get through even on Do Not Disturb → Settings › Focus › Do Not Disturb › People › Add.'
export const SCHOOL_QUESTION = 'What school do you go to?'

/**
 * The welcome texts for a pick, in send order. Picks that include SeatSnipe end
 * on the school question, since students answer the last text they see.
 */
export function welcomeTexts(product: Product): string[] {
  switch (product) {
    case 'seatsnipe':
      return [SEATSNIPE_WELCOME, DND_TIP, SCHOOL_QUESTION]
    case 'nudge':
      return [NUDGE_WELCOME, DND_TIP]
    case 'both':
      return [SEATSNIPE_WELCOME, NUDGE_WELCOME, DND_TIP, SCHOOL_QUESTION]
  }
}

// Subject + number, e.g. CSC222, csc 1301, MATH-1113, CS 1331L. Common words,
// days and times ("at 730", "fri 1159", "the 2024", "9 am") don't count.
const COURSE_CODE =
  /\b(?!(?:at|by|on|in|to|the|til|till|until|from|for|of|and|or|is|it|its|about|after|before|around|near|due|my|this|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|tmr|tmrw|tom|hw|ep|vid|vids|video|lec|lab|unit|quiz|exam|test|game|class|week|day|room|rm|ch)\b)[a-z]{2,5}\s?-?\d{3,4}[a-z]?\b(?!\s?(?:am|pm)\b)/
const CRN_NUMBER = /\b\d{5}\b/

function bareWords(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// "both" as an answer, not "both of my exams" or "both my classes"
const BOTH_WORD = /\bboth\b(?!\s+(?:of|my|the|these|those|exams?|classes|quizzes|tests)\b)/
const SEATSNIPE_WORDS = /seat\s*snipe|\bsnipe|\bseats?\b|\bcrn\b/
// "watch" and "class" also turn up in reminder requests ("remind me to watch the
// lecture", "my bio class has an exam"), so on their own they count last
const WEAK_SEATSNIPE_WORDS = /\bwatch|\bclass(?:es)?\b/
const NUDGE_TASK_WORDS =
  /\bremind|\bassignment|\bhomework\b|\bhw\b|\bdue\b|\bdeadline|\bexams?\b|\bquiz|\bessays?\b|\bprojects?\b/
const NUDGE_WORDS = new RegExp(`\\bnudge|${NUDGE_TASK_WORDS.source}`)
// "nudge, not seatsnipe" or "seatsnipe, no reminders": the rejected side doesn't
// count. A bare "no seats" describes a class ("csc 1301 has no seats"), so it stays.
const REJECT = String.raw`(?:not interested in|not here for|not looking for|no need for|never need|don'?t (?:need|want)|do not (?:need|want)|not|never)`
const REJECTED = new RegExp(
  String.raw`\b(?:(?:${REJECT}|no|without)\s+(?:the\s+|any\s+)?(?:seat\s*snipe|snipe|nudge|remind\w*|assignments?|homework|hw|both)|${REJECT}\s+(?:the\s+|any\s+)?seats?)\b`,
  'g'
)
// The question names SeatSnipe first and Nudge second
const FIRST_ONE = /^(?:the )?(?:first|1st|1)(?: one| option)?$/
const SECOND_ONE = /^(?:the )?(?:second|2nd|2|last)(?: one| option)?$/

/** Their answer to PICK_QUESTION → a pick, or null when it isn't one (ask again). */
export function pickFromAnswer(text: string): Product | null {
  const t = text.toLowerCase().replace(/’/g, "'").replace(REJECTED, ' ')
  if (BOTH_WORD.test(t)) return 'both'
  const seatSnipe = SEATSNIPE_WORDS.test(t) || (/\bwatch/.test(t) && (COURSE_CODE.test(t) || CRN_NUMBER.test(t)))
  const nudge = NUDGE_WORDS.test(t)
  if (seatSnipe && nudge) return 'both'
  if (seatSnipe) return 'seatsnipe'
  if (nudge) return 'nudge'
  if (WEAK_SEATSNIPE_WORDS.test(t)) return 'seatsnipe'
  const bare = bareWords(t)
  if (FIRST_ONE.test(bare)) return 'seatsnipe'
  if (SECOND_ONE.test(bare)) return 'nudge'
  return null
}

/**
 * A first text that already says what they want skips the question: just the
 * product's name, or a seat watch ("WATCH CSC222", "crn 15043"). Anything that
 * also mentions reminders or assignments still gets the question.
 */
export function pickFromFirstText(text: string): Product | null {
  const t = text.toLowerCase()
  const bare = bareWords(t)
  if (bare === 'seatsnipe' || bare === 'seat snipe') return 'seatsnipe'
  if (bare === 'nudge') return 'nudge'
  if (NUDGE_TASK_WORDS.test(t)) return null
  if (/\bcrn\b/.test(t)) return 'seatsnipe'
  if (/\bwatch/.test(t) && (COURSE_CODE.test(t) || CRN_NUMBER.test(t))) return 'seatsnipe'
  return null
}

// Greetings, filler and the pick's own words: none of them asks for anything
const EMPTY_WORDS = new Set(
  (
    'hi hii hiii hey heyy heyyy hello helloo yo yoo sup hiya howdy what whats wassup up who good morning afternoon evening there ' +
    'nudge seatsnipe seat seats snipe both reminder reminders class classes ' +
    'i im m s re ll d ve am is are here for the a an one please pls plz yes yeah yea yep ok okay k kk just and ' +
    'it that this thanks thank you u ty thx thnx tysm lol haha oh um uh sure idk me my want wanna need use to of ' +
    'cool nice bet sounds guess now think probably prob mostly def definitely rn go with pick choose option ' +
    'first second last 1st 2nd 1 2'
  ).split(' ')
)

const STRETCHED_GREETING = /^(?:h+i+|h+e+y+|y+o+|hel+o+)$/

/** Whether a text asks for something beyond a greeting or the pick itself ("hey", "nudge pls" don't). */
export function hasSomethingToAnswer(text: string): boolean {
  return bareWords(text)
    .split(' ')
    .some((w) => w !== '' && !EMPTY_WORDS.has(w) && !STRETCHED_GREETING.test(w))
}

/**
 * Which side to lean toward for unclear texts: their pick, until they've used
 * the other side more recently. Nothing for 'both' or no pick.
 */
export function leanFromUse(
  product: string | null | undefined,
  lastSeatSnipeUse: Date | null,
  lastNudgeUse: Date | null
): 'seatsnipe' | 'nudge' | null {
  if (product !== 'seatsnipe' && product !== 'nudge') return null
  if (!lastSeatSnipeUse && !lastNudgeUse) return product
  if (!lastNudgeUse) return 'seatsnipe'
  if (!lastSeatSnipeUse) return 'nudge'
  return lastNudgeUse > lastSeatSnipeUse ? 'nudge' : 'seatsnipe'
}

/**
 * The agent's hint for unclear texts. Clear requests for the other side are
 * handled normally, and recent texts outweigh the lean.
 */
export function pickGuidance(lean: string | null | undefined): string {
  if (lean === 'seatsnipe') {
    return `WHY THEY CAME:
- This student came for SeatSnipe (seat alerts). Use that only to read texts that could go either way: a bare "hi" gets something like "hey! got a class you need a seat in?", and a bare course code or CRN is a seat watch request.
- Handle clear requests for reminders or assignments normally, and never mention why they came.
- If their recent texts have been about reminders or assignments, follow those instead.`
  }
  if (lean === 'nudge') {
    return `WHY THEY CAME:
- This student came for Nudge (reminders). Use that only to read texts that could go either way: a bare "hi" gets something like "hey! what's due soon?", and a course code with a date or time is an assignment.
- Handle clear requests for seat watches normally, and never mention why they came.
- If their recent texts have been about seat watches, follow those instead.`
  }
  return ''
}
