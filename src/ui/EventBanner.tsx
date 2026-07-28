import type { JSX } from 'react'
import './chrome.css'
import type { GameEvent } from '../engine/types'
import { SEAT_NAMES } from '../engine/types'

export interface EventBannerProps {
  events: readonly GameEvent[]
}

function sentenceFor(event: GameEvent): string | null {
  switch (event.type) {
    case 'elimination':
      return `${SEAT_NAMES[event.seat]} eliminated — board resets`
    case 'skip':
      return `${SEAT_NAMES[event.seat]} has no moves — skipped`
    case 'promotion':
      return `${SEAT_NAMES[event.seat]} pawn promoted to Queen`
    case 'draw':
      return 'No player can move — draw'
    default:
      return null
  }
}

/**
 * The human-readable sentences a given event list would produce, i.e.
 * whether `<EventBanner>` would render anything. Exported so callers (the
 * app shell's status slot) can decide precedence against other status
 * content — e.g. the AI "thinking" indicator — without duplicating this
 * event -> sentence mapping.
 */
export function eventSentences(events: readonly GameEvent[]): string[] {
  return events
    .map((event) => sentenceFor(event))
    .filter((s): s is string => s !== null)
}

/** Transient announcements for notable events (elimination, skip, promotion, draw). */
export function EventBanner({ events }: EventBannerProps): JSX.Element | null {
  const sentences = eventSentences(events)

  if (sentences.length === 0) return null

  return (
    <div className="event-banner" role="status" aria-live="polite">
      {sentences.map((s, i) => (
        <div key={i} className="event-banner__item">
          {s}
        </div>
      ))}
    </div>
  )
}
