import { useState, type JSX } from 'react'
import '../chrome.css'
import { SEAT_NAMES, SEAT_ORDER, type Seat } from '../../engine/types'
import type { AiLevel } from '../../engine/ai'
import {
  AI_LEVELS,
  AI_LEVEL_LABELS,
  DEFAULT_AI_CONFIG,
  type AiConfig,
} from '../../state/aiConfig'

export interface HomeProps {
  hasSave: boolean
  onNewGame: (aiSeats: AiConfig) => void
  onResume: () => void
  onRules: () => void
}

const CHOICES: readonly (AiLevel | null)[] = [null, ...AI_LEVELS]

function choiceLabel(choice: AiLevel | null): string {
  return choice === null ? 'You' : AI_LEVEL_LABELS[choice]
}

/** Landing screen: choose who plays each seat, start, resume, or read the rules. */
export function Home({
  hasSave,
  onNewGame,
  onResume,
  onRules,
}: HomeProps): JSX.Element {
  const [aiSeats, setAiSeats] = useState<AiConfig>(DEFAULT_AI_CONFIG)

  const setSeat = (seat: Seat, choice: AiLevel | null) => {
    setAiSeats((current) => ({ ...current, [seat]: choice }))
  }

  return (
    <div className="screen screen--home">
      <h1 className="screen__title">Chards</h1>
      <p className="screen__subtitle">
        A four-player chess variant played with cards
      </p>

      <section className="seat-setup" aria-label="Who plays each seat">
        <h2 className="seat-setup__title">Players</h2>
        {SEAT_ORDER.map((seat) => (
          <div className="seat-setup__row" key={seat} data-seat={seat}>
            <span className="seat-setup__seat">
              <span
                className={`seat-setup__swatch seat-setup__swatch--${seat}`}
                aria-hidden="true"
              />
              {SEAT_NAMES[seat]}
            </span>
            <div
              className="seat-setup__choices"
              role="group"
              aria-label={`${SEAT_NAMES[seat]} player`}
            >
              {CHOICES.map((choice) => {
                const active = aiSeats[seat] === choice
                return (
                  <button
                    key={choice ?? 'human'}
                    type="button"
                    className="seat-setup__choice"
                    data-active={active ? 'true' : 'false'}
                    aria-pressed={active}
                    onClick={() => setSeat(seat, choice)}
                  >
                    {choiceLabel(choice)}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <p className="seat-setup__hint">
          Seats marked <strong>You</strong> are played by whoever is holding the
          device — pass it around.
        </p>
      </section>

      <div className="screen__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onNewGame(aiSeats)}
        >
          New game
        </button>
        {hasSave ? (
          <button type="button" className="btn" onClick={onResume}>
            Resume
          </button>
        ) : null}
        <button type="button" className="btn btn--ghost" onClick={onRules}>
          Rules
        </button>
      </div>
    </div>
  )
}
