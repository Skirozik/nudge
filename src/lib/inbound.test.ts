import { describe, it, expect } from 'vitest'
import { isOptOut, isReaction } from './inbound'

describe('isOptOut', () => {
  it.each(['STOP', 'UNSUBSCRIBE', 'CANCEL', 'OPT OUT'])('%s opts out', (word) => {
    expect(isOptOut(word)).toBe(true)
  })

  it('only matches the whole text', () => {
    expect(isOptOut('STOP REMINDING ME ABOUT BIO')).toBe(false)
    expect(isOptOut('CANCEL MY WATCH')).toBe(false)
  })
})

describe('isReaction', () => {
  it.each([
    'Liked “SeatSnipe or Nudge?”',
    'Loved “Hi! Are you here for SeatSnipe (get a text when a seat opens in a full class) or Nudge (reminders for assignments and due dates)?”',
    'Questioned “What school do you go to?”',
    'Laughed at “SeatSnipe or Nudge?”',
    'Emphasized “SeatSnipe or Nudge?”',
    'Reacted 👍 to “SeatSnipe or Nudge?”',
    'Removed a heart from “SeatSnipe or Nudge?”',
  ])('%s is a tapback', (text) => {
    expect(isReaction(text)).toBe(true)
  })

  it('trusts BlueBubbles linking it to another message', () => {
    expect(isReaction('anything', 'p:0/1E2D3C4B-0000-4000-8000-000000000000')).toBe(true)
  })

  it.each(['seatsnipe', 'I liked the SeatSnipe one', 'Loved it, nudge please', 'liked “nudge”'])('%s is a typed text', (text) => {
    expect(isReaction(text)).toBe(false)
  })
})
