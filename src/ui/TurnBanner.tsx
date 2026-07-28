import type { JSX } from 'react'
import './chrome.css'
import type { GamePhase, Seat } from '../engine/types'
import { SEAT_NAMES } from '../engine/types'

export interface TurnBannerProps {
  turn: Seat
  phase: GamePhase
  winner: Seat | null
}

/** Banner announcing whose move it is, or the game's outcome once it has ended. */
export function TurnBanner({
  turn,
  phase,
  winner,
}: TurnBannerProps): JSX.Element {
  if (phase === 'finished') {
    const name = winner ? SEAT_NAMES[winner] : null
    return (
      <div className="turn-banner turn-banner--done" data-phase={phase}>
        {name ? `${name} wins!` : 'Game over'}
      </div>
    )
  }

  if (phase === 'draw') {
    return (
      <div className="turn-banner turn-banner--done" data-phase={phase}>
        Draw — no player can move
      </div>
    )
  }

  return (
    <div
      className={`turn-banner turn-banner--${turn}`}
      data-phase={phase}
      data-turn={turn}
    >
      {SEAT_NAMES[turn]} to move
    </div>
  )
}
