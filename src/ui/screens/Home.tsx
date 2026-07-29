import { useState, type JSX } from 'react'
import '../chrome.css'
import {
  SEAT_NAMES,
  SEAT_ORDER,
  SEAT_SUITS,
  type Seat,
} from '../../engine/types'
import { DECK_COUNTS, type DeckCount } from '../../engine/deck'
import type { AiLevel } from '../../engine/ai'
import {
  AI_LEVELS,
  AI_LEVEL_LABELS,
  AI_PACES,
  AI_PACE_LABELS,
  DEFAULT_AI_CONFIG,
  DEFAULT_AI_PACE,
  type AiConfig,
  type AiPace,
} from '../../state/aiConfig'

export interface HomeProps {
  hasSave: boolean
  onNewGame: (
    aiSeats: AiConfig,
    pace: AiPace,
    deckCount: DeckCount,
  ) => void
  onResume: () => void
  onRules: () => void
}

const CHOICES: readonly (AiLevel | null)[] = [null, ...AI_LEVELS]

const SUIT_SYMBOLS: Readonly<Record<string, string>> = {
  C: '♣',
  D: '♦',
  H: '♥',
  S: '♠',
}

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
  const [pace, setPace] = useState<AiPace>(DEFAULT_AI_PACE)
  const [deckCount, setDeckCount] = useState<DeckCount>(1)

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
              {SEAT_NAMES[seat]}{' '}
              <span
                className={`seat-setup__suit seat-setup__suit--${SEAT_SUITS[seat] === 'D' || SEAT_SUITS[seat] === 'H' ? 'red' : 'black'}`}
              >
                {SUIT_SYMBOLS[SEAT_SUITS[seat]]}
              </span>
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
        <div className="seat-setup__row" data-row="decks">
          <span className="seat-setup__seat">Decks</span>
          <div
            className="seat-setup__choices"
            role="group"
            aria-label="Number of decks"
          >
            {DECK_COUNTS.map((count) => (
              <button
                key={count}
                type="button"
                className="seat-setup__choice"
                data-active={deckCount === count ? 'true' : 'false'}
                aria-pressed={deckCount === count}
                onClick={() => setDeckCount(count)}
              >
                {count === 1 ? '1 deck' : `${count} decks`}
              </button>
            ))}
          </div>
        </div>

        <div className="seat-setup__row" data-row="pace">
          <span className="seat-setup__seat">Computer pace</span>
          <div
            className="seat-setup__choices"
            role="group"
            aria-label="Computer pace"
          >
            {AI_PACES.map((option) => (
              <button
                key={option}
                type="button"
                className="seat-setup__choice"
                data-active={pace === option ? 'true' : 'false'}
                aria-pressed={pace === option}
                onClick={() => setPace(option)}
              >
                {AI_PACE_LABELS[option]}
              </button>
            ))}
          </div>
        </div>

        <p className="seat-setup__hint">
          Each player deals from their own suit:{' '}
          {deckCount === 1 ? '13' : '26'} cards each. Seats marked{' '}
          <strong>You</strong> are played by whoever is holding the device — pass
          it around.
        </p>
      </section>

      <div className="screen__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onNewGame(aiSeats, pace, deckCount)}
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
