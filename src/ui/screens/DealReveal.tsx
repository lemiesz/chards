import type { JSX } from 'react'
import '../chrome.css'
import type { Card, Seat } from '../../engine/types'
import { pointValue, SEAT_NAMES, SEAT_ORDER } from '../../engine/types'

export interface DealRevealProps {
  hands: Readonly<Record<Seat, readonly Card[]>>
  firstSeat: Seat
  onStart: () => void
}

function suitToSymbol(suit: Card['suit']): string {
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

function handTotal(hand: readonly Card[]): number {
  return hand.reduce((sum, card) => sum + pointValue(card), 0)
}

/** Reveals each seat's dealt hand and announces who goes first. */
export function DealReveal({
  hands,
  firstSeat,
  onStart,
}: DealRevealProps): JSX.Element {
  const firstTotal = handTotal(hands[firstSeat])

  return (
    <div className="screen screen--deal">
      <h1 className="screen__title">The deal</h1>

      <div className="deal-hands">
        {SEAT_ORDER.map((seat) => {
          const hand = hands[seat]
          const total = handTotal(hand)
          return (
            <div
              key={seat}
              className={`deal-hand deal-hand--${seat}`}
              data-seat={seat}
            >
              <div className="deal-hand__header">
                <span
                  className={`deal-hand__swatch deal-hand__swatch--${seat}`}
                  aria-hidden="true"
                />
                {SEAT_NAMES[seat]}
              </div>
              <div className="deal-hand__cards">
                {hand.map((card, i) => (
                  <span
                    key={i}
                    className={`deal-hand__card deal-hand__card--${card.suit === 'D' || card.suit === 'H' ? 'red' : 'black'}`}
                  >
                    {card.rank}
                    {suitToSymbol(card.suit)}
                  </span>
                ))}
              </div>
              <div className="deal-hand__total">Total: {total}</div>
            </div>
          )
        })}
      </div>

      <p className="deal-announcement" role="status">
        {SEAT_NAMES[firstSeat]} has the lowest total ({firstTotal}) and goes
        first
      </p>

      <div className="screen__actions">
        <button type="button" className="btn btn--primary" onClick={onStart}>
          Start
        </button>
      </div>
    </div>
  )
}
