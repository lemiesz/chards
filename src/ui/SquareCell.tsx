import type { JSX } from 'react'
import { SEAT_NAMES, type Piece, type Seat, type Square } from '../engine/types'
import { PieceView } from './PieceView'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

/** Algebraic-ish label: col 0..7 -> a..h, row 0..7 -> rank 8..1. */
export function squareLabel(square: Square): string {
  return `${FILES[square.col]}${8 - square.row}`
}

function suitSymbol(suit: Piece['card']['suit']): string {
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

function pieceDescription(piece: Piece): string {
  return `${SEAT_NAMES[piece.owner]} ${piece.pieceType} ${piece.card.rank}${suitSymbol(piece.card.suit)}`
}

export type TargetState = 'none' | 'move' | 'capture'
export type LastMoveState = 'none' | 'from' | 'to'

export interface SquareCellProps {
  square: Square
  piece: Piece | null
  /** Alternating checkerboard shading. */
  color: 'light' | 'dark'
  /** Seat whose back row this square belongs to, or null for interior/corner squares. */
  edgeSeat: Seat | null
  /** False when `edgeSeat` has no pieces left; the edge stripe renders dimmed. */
  edgeAlive: boolean
  /** True when `edgeSeat` is the seat currently on turn. */
  edgeActive: boolean
  isSelected: boolean
  targetState: TargetState
  lastMoveState: LastMoveState
  onTap: (square: Square) => void
  disabled?: boolean
}

/** A single tappable board square: shading, seat edge stripe, highlights, and an optional piece. */
export function SquareCell({
  square,
  piece,
  color,
  edgeSeat,
  edgeAlive,
  edgeActive,
  isSelected,
  targetState,
  lastMoveState,
  onTap,
  disabled = false,
}: SquareCellProps): JSX.Element {
  const label = squareLabel(square)
  const ariaLabel = `${label}, ${piece ? pieceDescription(piece) : 'empty'}`

  const dataState = isSelected
    ? 'selected'
    : targetState === 'capture'
      ? 'capture-target'
      : targetState === 'move'
        ? 'target'
        : lastMoveState !== 'none'
          ? `last-${lastMoveState}`
          : 'default'

  const classNames = [
    'square',
    `square--${color}`,
    isSelected ? 'square--selected' : '',
    targetState !== 'none' ? 'square--target' : '',
    lastMoveState !== 'none' ? 'square--last' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={classNames}
      aria-label={ariaLabel}
      data-square={`${square.row},${square.col}`}
      data-state={dataState}
      data-edge-seat={edgeSeat ?? undefined}
      data-edge-alive={edgeSeat ? edgeAlive : undefined}
      data-edge-active={edgeSeat ? edgeActive : undefined}
      disabled={disabled}
      onClick={() => onTap(square)}
    >
      {piece ? <PieceView piece={piece} /> : null}
    </button>
  )
}
