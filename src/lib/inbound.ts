// Keywords checked on every inbound text, shared by the webhook and the
// worker's missed-message replay so both treat them the same.

// STOP is the carrier standard, but people reasonably reach for UNSUBSCRIBE/END/QUIT
// too — and anything not matched here falls through to the agent (or the welcome
// question), which reads as "I asked to stop and it kept texting me", so treat
// them alike. CANCEL isn't one: on SeatSnipe it usually means "cancel my watch",
// so the agent asks what to cancel.
export const OPT_OUT_WORDS = ['STOP', 'UNSUBSCRIBE', 'END', 'QUIT', 'STOPALL', 'REVOKE', 'OPTOUT', 'OPT OUT']

// Sent once, when someone opts out, so a student who meant something else knows
// what happened and how to undo it
export const OPT_OUT_REPLY = "You won't get any more texts. Text START if that was a mistake."

/** `upper` is the trimmed text in upper case. */
export function isOptOut(upper: string): boolean {
  return OPT_OUT_WORDS.includes(upper)
}

// How iMessage writes a tapback as text, e.g. Liked “SeatSnipe or Nudge?”
const TAPBACK_TEXT = /^(?:Liked|Loved|Disliked|Laughed at|Emphasized|Questioned|Reacted .{1,30} to|Removed an? .{1,40} from) “/

/**
 * A tapback (Liked, Loved, an emoji…) rather than a typed text. BlueBubbles
 * links it to the message it reacts to; the text pattern is the fallback.
 */
export function isReaction(text: string, associatedMessage?: string | null): boolean {
  return !!associatedMessage || TAPBACK_TEXT.test(text)
}
