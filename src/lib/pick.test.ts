import { describe, it, expect } from 'vitest'
import {
  PICK_QUESTION,
  SEATSNIPE_WELCOME,
  NUDGE_WELCOME,
  DND_TIP,
  SCHOOL_QUESTION,
  welcomeTexts,
  pickFromAnswer,
  pickFromFirstText,
  hasSomethingToAnswer,
  leanFromUse,
  pickGuidance,
} from './pick'

describe('PICK_QUESTION', () => {
  it('is the agreed wording', () => {
    expect(PICK_QUESTION).toBe(
      'Hi! Are you here for SeatSnipe (get a text when a seat opens in a full class)\nor\nNudge (reminders for assignments and due dates)?'
    )
  })
})

describe('welcomeTexts', () => {
  it('SeatSnipe: register line, Do Not Disturb tip, school question last', () => {
    expect(welcomeTexts('seatsnipe')).toEqual([SEATSNIPE_WELCOME, DND_TIP, SCHOOL_QUESTION])
  })

  it('Nudge: the reminders line, then the Do Not Disturb tip', () => {
    expect(welcomeTexts('nudge')).toEqual([NUDGE_WELCOME, DND_TIP])
  })

  it('both: SeatSnipe line, Nudge line, tip, school question last', () => {
    expect(welcomeTexts('both')).toEqual([SEATSNIPE_WELCOME, NUDGE_WELCOME, DND_TIP, SCHOOL_QUESTION])
  })
})

describe('pickFromAnswer', () => {
  it.each([
    ['SeatSnipe', 'seatsnipe'],
    ['seat snipe!', 'seatsnipe'],
    ['the seat one', 'seatsnipe'],
    ['snipe', 'seatsnipe'],
    ['watching a class', 'seatsnipe'],
    ['class', 'seatsnipe'],
    ['Nudge', 'nudge'],
    ['reminders', 'nudge'],
    ['remind me about stuff', 'nudge'],
    ['homework', 'nudge'],
    ['my assignments', 'nudge'],
    ['due dates', 'nudge'],
    ['reminders for my classes', 'nudge'],
    ['both', 'both'],
    ['BOTH please', 'both'],
    ['seatsnipe and nudge', 'both'],
    ['hw', 'nudge'],
    // The negated side doesn't count
    ['Nudge, not seatsnipe', 'nudge'],
    ['SeatSnipe, no reminders', 'seatsnipe'],
    ["I don't need reminders, just seats", 'seatsnipe'],
    ['I don’t want seatsnipe, just nudge', 'nudge'],
    ['not sure, both?', 'both'],
    ['just nudge, not both', 'nudge'],
    ['not both, just nudge', 'nudge'],
    ['seatsnipe. no need for reminders', 'seatsnipe'],
    ["I'm not here for nudge, seatsnipe", 'seatsnipe'],
    ["nudge, I'm not interested in seatsnipe", 'nudge'],
    ['seatsnipe, never need reminders', 'seatsnipe'],
    ['seatsnipe no hw', 'seatsnipe'],
    ['nudge. not looking for seats', 'nudge'],
    // A bare "no seats" describes a class, it doesn't reject SeatSnipe
    ['csc 1301 has no seats', 'seatsnipe'],
    ['there are no seats left in csc 1301', 'seatsnipe'],
    // "watch" and "class" lose to reminder words
    ['remind me to watch the lecture tonight at 8', 'nudge'],
    ['set a reminder to watch the review video', 'nudge'],
    ['my bio class has an exam friday', 'nudge'],
    ['I have a quiz in my bio class friday', 'nudge'],
    ['can you watch csc 1301 for me', 'seatsnipe'],
    // "both of my exams" isn't the answer "both"
    ['remind me about both of my exams friday', 'nudge'],
    // The question names SeatSnipe first, Nudge second
    ['the first one', 'seatsnipe'],
    ['1', 'seatsnipe'],
    ['the second one', 'nudge'],
    ['2', 'nudge'],
  ] as const)('%s → %s', (answer, expected) => {
    expect(pickFromAnswer(answer)).toBe(expected)
  })

  it.each(['hi', 'what is this?', 'who are you', 'ok', 'idk', '?', '👍', 'first time here'])('%s is not a pick', (answer) => {
    expect(pickFromAnswer(answer)).toBeNull()
  })
})

describe('pickFromFirstText', () => {
  it.each([
    ['WATCH CSC222', 'seatsnipe'],
    ['watch csc 1301', 'seatsnipe'],
    ['Watch MATH-1113', 'seatsnipe'],
    ['can you watch CS 1331L for me', 'seatsnipe'],
    ['watch 15043', 'seatsnipe'],
    ['crn 15043', 'seatsnipe'],
    ['hey nudge, watch csc 1301', 'seatsnipe'],
    ['SeatSnipe!', 'seatsnipe'],
    ['seat snipe', 'seatsnipe'],
    ['nudge', 'nudge'],
    ['Nudge 👋', 'nudge'],
  ] as const)('%s → %s', (text, expected) => {
    expect(pickFromFirstText(text)).toBe(expected)
  })

  it.each([
    'hi',
    'hey nudge',
    'watch out',
    'remind me to watch the lecture',
    'remind me to watch the CSC 1301 lecture',
    'my CSC 1301 assignment is due friday',
    'nsbe',
    // Times and years aren't course codes
    'I need to watch lecture 3 by 1159 tonight',
    'watch the review session at 730',
    'watch the 2024 debate',
    'watching the game at 830',
    'watch lecture on 1015',
    'watch csc 1030pm',
    'watch hw 1030',
    'watch lec fri 1159',
    'watch my 1030',
    'watch tmrw 1159',
    'watch thu 1030',
    'watch video 1030',
    'watch csc 1301 before my exam',
  ])('%s gets the question', (text) => {
    expect(pickFromFirstText(text)).toBeNull()
  })
})

describe('hasSomethingToAnswer', () => {
  it.each(['hi', 'Hey!', 'hiiii', 'heyyyy', 'hello there', 'hey nudge', 'Hi Nudge 👋', 'nudge', 'seatsnipe', "what's up", 'good morning', 'ok', 'nudge pls', "I'm here for nudge", 'the seat one', 'both please', 'need reminders for my classes', 'what is this?', 'who is this', 'nudge thx', 'nudge for now', 'nudge i guess', 'nudge sounds good', 'the second one', 'the first option', '👍', ''])(
    '%s asks for nothing',
    (text) => {
      expect(hasSomethingToAnswer(text)).toBe(false)
    }
  )

  it.each(['hi can you help me', 'watch csc 1301', 'remind me friday', 'nudge, remind me about my calc exam friday 9am', 'seatsnipe, csc 1301', "what's due this week", 'my bio quiz is friday'])(
    '%s asks for something',
    (text) => {
      expect(hasSomethingToAnswer(text)).toBe(true)
    }
  )
})

describe('leanFromUse', () => {
  const jan = new Date('2027-01-10')
  const feb = new Date('2027-02-10')

  it('is their pick until they use anything', () => {
    expect(leanFromUse('seatsnipe', null, null)).toBe('seatsnipe')
    expect(leanFromUse('nudge', null, null)).toBe('nudge')
  })

  it('follows whichever side they used last, whatever they picked', () => {
    expect(leanFromUse('seatsnipe', jan, feb)).toBe('nudge')
    expect(leanFromUse('nudge', feb, jan)).toBe('seatsnipe')
    expect(leanFromUse('seatsnipe', null, jan)).toBe('nudge')
    expect(leanFromUse('nudge', jan, null)).toBe('seatsnipe')
  })

  it('never leans for both or no pick', () => {
    expect(leanFromUse('both', jan, null)).toBeNull()
    expect(leanFromUse(null, null, feb)).toBeNull()
  })
})

describe('pickGuidance', () => {
  it('SeatSnipe lean: settles unclear texts as seat watches, never blocks reminders', () => {
    const g = pickGuidance('seatsnipe')
    expect(g).toContain('came for SeatSnipe')
    expect(g).toContain('got a class you need a seat in?')
    expect(g).toContain('Handle clear requests for reminders or assignments normally')
    expect(g).toContain('If their recent texts have been about reminders or assignments, follow those instead.')
  })

  it('Nudge: settles unclear texts as reminders, never blocks seat watches', () => {
    const g = pickGuidance('nudge')
    expect(g).toContain('came for Nudge')
    expect(g).toContain("what's due soon?")
    expect(g).toContain('Handle clear requests for seat watches normally')
  })

  it('adds nothing for both or no pick', () => {
    expect(pickGuidance('both')).toBe('')
    expect(pickGuidance(null)).toBe('')
    expect(pickGuidance(undefined)).toBe('')
  })
})
