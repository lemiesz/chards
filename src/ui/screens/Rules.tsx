import type { JSX } from 'react'
import '../chrome.css'

export interface RulesProps {
  onBack: () => void
}

const CARD_TABLE: readonly [string, string, string][] = [
  ['Ace', 'Bishop', '1'],
  ['2 – 9', 'Pawn', 'face value'],
  ['10', 'Rook', '10'],
  ['Jack', 'Knight', '11'],
  ['Queen', 'Queen', '12'],
  ['King', 'King', '13'],
]

/** Scrollable, condensed rendering of the rules (PLAN.md §1) for a phone screen. */
export function Rules({ onBack }: RulesProps): JSX.Element {
  return (
    <div className="screen screen--rules">
      <h1 className="screen__title">Rules</h1>

      <div className="rules-body">
        <section className="rules-section">
          <h2>Setup</h2>
          <p>
            Four players sit one per edge: South, West, North, East. A standard
            52-card deck is shuffled and each player is dealt 6 cards, placed in
            draw order into the 6 center slots of their own back row. The 4
            board corners are always empty.
          </p>
        </section>

        <section className="rules-section">
          <h2>Cards become pieces</h2>
          <table className="rules-table">
            <thead>
              <tr>
                <th>Card</th>
                <th>Piece</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {CARD_TABLE.map(([card, piece, value]) => (
                <tr key={card}>
                  <td>{card}</td>
                  <td>{piece}</td>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rules-section">
          <h2>Who goes first</h2>
          <p>
            Each player's 6 cards are added up. The{' '}
            <strong>lowest total goes first</strong>. Ties are broken by
            comparing lowest cards, then the next lowest, and so on; if still
            tied, a player is chosen at random. Play proceeds clockwise: South →
            West → North → East.
          </p>
        </section>

        <section className="rules-section">
          <h2>Movement</h2>
          <p>Standard chess movement, with a few differences:</p>
          <ul>
            <li>
              The <strong>King is an ordinary piece</strong> — there is no
              check, checkmate, or castling. Kings can be captured like anything
              else, and can move onto attacked squares freely.
            </li>
            <li>
              Bishops, Rooks, Queens, and Knights move exactly as in chess.
            </li>
            <li>
              <strong>Pawns</strong> move one square straight ahead — away from
              their own home edge — and capture one square diagonally forward.
              There is no two-square first move and no en passant.
            </li>
            <li>
              A pawn that reaches the far edge{' '}
              <strong>promotes to a Queen</strong> automatically. Promotion
              survives board resets.
            </li>
            <li>You may capture any opponent's piece, but never your own.</li>
            <li>If you have no legal move, your turn is skipped.</li>
          </ul>
        </section>

        <section className="rules-section">
          <h2>Elimination &amp; board reset</h2>
          <p>
            Losing your last piece eliminates you immediately. When that
            happens, every surviving player's remaining pieces are re-placed on
            their own back row, slot 1 onward, in ascending point value (ties
            broken by suit: ♣ &lt; ♦ &lt; ♥ &lt; ♠). Play then continues
            clockwise from the player who made the eliminating capture.
          </p>
        </section>

        <section className="rules-section">
          <h2>How to win</h2>
          <p>
            The game ends when only one player still has pieces on the board —
            that player wins. If every surviving player is skipped in the same
            round, the game is a draw.
          </p>
        </section>
      </div>

      <div className="screen__actions">
        <button type="button" className="btn btn--primary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  )
}
