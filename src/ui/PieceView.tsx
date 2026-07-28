import type { JSX } from 'react'
import type { Piece } from '../engine/types'

/** Solid/filled chess glyphs so pieces read well on both light and dark squares. */
const GLYPHS: Record<Piece['pieceType'], string> = {
  pawn: '♟',
  knight: '♞',
  bishop: '♝',
  rook: '♜',
  queen: '♛',
  king: '♚',
}

const RED_SUITS = new Set(['D', 'H'])

export interface PieceViewProps {
  piece: Piece
}

/** Renders a single piece: glyph chip in the owner's seat colour plus a small card label. */
export function PieceView({ piece }: PieceViewProps): JSX.Element {
  const glyph = GLYPHS[piece.pieceType]
  const suitColor = RED_SUITS.has(piece.card.suit) ? 'red' : 'black'

  return (
    <div
      className="piece"
      data-seat={piece.owner}
      data-piece-type={piece.pieceType}
    >
      <div className={`piece__chip piece__chip--${piece.owner}`}>
        <span className="piece__glyph" aria-hidden="true">
          {glyph}
        </span>
        {piece.promoted ? (
          <span
            className="piece__promo-marker"
            aria-hidden="true"
            data-testid="promo-marker"
          >
            ↑
          </span>
        ) : null}
      </div>
      <span className={`piece__card piece__card--${suitColor}`}>
        {piece.card.rank}
        {suitToSymbol(piece.card.suit)}
      </span>
    </div>
  )
}

function suitToSymbol(suit: Piece['card']['suit']): string {
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
