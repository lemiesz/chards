import type { JSX } from 'react'
import './chrome.css'
import type { GameState, Seat } from '../engine/types'
import { SEAT_NAMES, SEAT_ORDER } from '../engine/types'

export interface PlayerPanelProps {
  state: GameState
  /** Piece counts per seat, computed by the caller from the board. */
  pieceCounts: Record<Seat, number>
  /** Which seats the computer plays. Omit for an all-human game. */
  aiSeats?: Readonly<Record<Seat, string | null>>
}

function suitToSymbol(suit: 'C' | 'D' | 'H' | 'S'): string {
  switch (suit) {
    case 'C':
      return '♣'
    case 'D':
      return '♦'
    case 'H':
      return '♥'
    case 'S':
      return '♠'
  }
}

/** Strip of four seat cards: name, colour, pieces remaining, captures, turn + elimination status. */
export function PlayerPanel({
  state,
  pieceCounts,
  aiSeats,
}: PlayerPanelProps): JSX.Element {
  return (
    <div className="player-panel">
      {SEAT_ORDER.map((seat) => {
        const eliminated = !state.aliveSeats.includes(seat)
        const isTurn =
          state.turn === seat && state.phase === 'playing' && !eliminated
        const captured = state.captures.filter((c) => c.by === seat)

        return (
          <div
            key={seat}
            className={`player-card player-card--${seat}${eliminated ? ' player-card--eliminated' : ''}${isTurn ? ' player-card--turn' : ''}`}
            data-seat={seat}
            data-eliminated={eliminated ? 'true' : 'false'}
            data-turn={isTurn ? 'true' : 'false'}
          >
            <div className="player-card__header">
              <span
                className={`player-card__swatch player-card__swatch--${seat}`}
                aria-hidden="true"
              />
              <span className="player-card__name">
                {SEAT_NAMES[seat]}{' '}
                <span className="player-card__letter">({seat})</span>
              </span>
              {aiSeats?.[seat] ? (
                <span
                  className="player-card__cpu"
                  title={`Computer (${aiSeats[seat]})`}
                >
                  CPU
                </span>
              ) : null}
              {isTurn ? (
                <span className="player-card__marker">to move</span>
              ) : null}
              {eliminated ? (
                <span className="player-card__marker player-card__marker--out">
                  out
                </span>
              ) : null}
            </div>

            <div className="player-card__pieces">
              {pieceCounts[seat]} piece{pieceCounts[seat] === 1 ? '' : 's'}
            </div>

            <div
              className="player-card__captures"
              aria-label={`${SEAT_NAMES[seat]} captured cards`}
            >
              {captured.length === 0 ? (
                <span className="player-card__captures-empty">no captures</span>
              ) : (
                captured.map((c, i) => (
                  <span
                    key={`${c.piece.id}-${i}`}
                    className={`player-card__capture player-card__capture--${
                      c.piece.card.suit === 'D' || c.piece.card.suit === 'H'
                        ? 'red'
                        : 'black'
                    }`}
                  >
                    {c.piece.card.rank}
                    {suitToSymbol(c.piece.card.suit)}
                  </span>
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
