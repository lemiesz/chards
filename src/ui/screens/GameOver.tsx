import type { JSX } from 'react'
import '../chrome.css'
import type { Seat } from '../../engine/types'
import { SEAT_NAMES } from '../../engine/types'

export interface GameOverProps {
  winner: Seat | null
  onRematch: () => void
  onHome: () => void
}

/** End-of-game screen: shows the winner (or a draw), offers a rematch or home. */
export function GameOver({
  winner,
  onRematch,
  onHome,
}: GameOverProps): JSX.Element {
  return (
    <div className="screen screen--game-over">
      <h1 className="screen__title">
        {winner ? `${SEAT_NAMES[winner]} wins!` : 'Draw'}
      </h1>
      <p className="screen__subtitle">
        {winner
          ? `${SEAT_NAMES[winner]} is the last player standing.`
          : 'No player could move — the game ends in a draw.'}
      </p>

      <div className="screen__actions">
        <button type="button" className="btn btn--primary" onClick={onRematch}>
          Rematch
        </button>
        <button type="button" className="btn btn--ghost" onClick={onHome}>
          Home
        </button>
      </div>
    </div>
  )
}
