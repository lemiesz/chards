import type { JSX } from 'react'
import {
  BOARD_SIZE,
  SEAT_ORDER,
  SETUP_SLOTS,
  type Board as BoardModel,
  type Move,
  type Seat,
  type Square,
} from '../engine/types'
import { SquareCell, type LastMoveState, type TargetState } from './SquareCell'
import './board.css'

/** Square -> owning seat, derived once from SETUP_SLOTS (corners map to nothing). */
const EDGE_SEAT_BY_SQUARE: ReadonlyMap<string, Seat> = (() => {
  const map = new Map<string, Seat>()
  for (const seat of SEAT_ORDER) {
    for (const square of SETUP_SLOTS[seat]) {
      map.set(`${square.row},${square.col}`, seat)
    }
  }
  return map
})()

function edgeSeatFor(square: Square): Seat | null {
  return EDGE_SEAT_BY_SQUARE.get(`${square.row},${square.col}`) ?? null
}

function sameSquare(a: Square, b: Square): boolean {
  return a.row === b.row && a.col === b.col
}

export interface BoardProps {
  board: BoardModel
  selected: Square | null
  legalTargets: readonly Square[]
  lastMove: Move | null
  /** Fired for every tap/click on any square, including empty ones. */
  onSquareTap: (square: Square) => void
  /** Seats with no pieces left; their edge stripe renders dimmed. */
  aliveSeats: readonly Seat[]
  /** Whose turn it is — used to subtly emphasise that seat's edge stripe. */
  turn: Seat
  /** Optional: disables interaction (game over). Default false. */
  disabled?: boolean
}

/** The 8x8 game board: checkerboard shading, seat edge stripes, pieces, and highlights. */
export function Board({
  board,
  selected,
  legalTargets,
  lastMove,
  onSquareTap,
  aliveSeats,
  turn,
  disabled = false,
}: BoardProps): JSX.Element {
  const cells: JSX.Element[] = []

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const square: Square = { row, col }
      const piece = board[row][col]
      const edgeSeat = edgeSeatFor(square)
      const isSelected = selected !== null && sameSquare(selected, square)
      const isTarget = legalTargets.some((t) => sameSquare(t, square))
      const targetState: TargetState = isTarget
        ? piece
          ? 'capture'
          : 'move'
        : 'none'

      let lastMoveState: LastMoveState = 'none'
      if (lastMove) {
        if (sameSquare(lastMove.from, square)) lastMoveState = 'from'
        else if (sameSquare(lastMove.to, square)) lastMoveState = 'to'
      }

      cells.push(
        <SquareCell
          key={`${row},${col}`}
          square={square}
          piece={piece}
          color={(row + col) % 2 === 0 ? 'light' : 'dark'}
          edgeSeat={edgeSeat}
          edgeAlive={edgeSeat ? aliveSeats.includes(edgeSeat) : true}
          edgeActive={edgeSeat === turn}
          isSelected={isSelected}
          targetState={targetState}
          lastMoveState={lastMoveState}
          onTap={onSquareTap}
          disabled={disabled}
        />,
      )
    }
  }

  return (
    <div className="board" data-testid="board">
      {cells}
    </div>
  )
}
