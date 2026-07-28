import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  BOARD_SIZE,
  SEAT_ORDER,
  SETUP_SLOTS,
  type Board as BoardModel,
  type Move,
  type Piece,
  type PieceType,
  type Seat,
  type Square,
} from '../engine/types'
import { Board } from './Board'

// ---------------------------------------------------------------------------
// Test helpers — hand-built boards, no engine/setup.ts or engine/moves.ts.
// ---------------------------------------------------------------------------

function emptyBoard(): (Piece | null)[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array<Piece | null>(BOARD_SIZE).fill(null),
  )
}

let idCounter = 0

function makePiece(
  owner: Seat,
  pieceType: PieceType,
  overrides: Partial<Piece> = {},
): Piece {
  idCounter += 1
  return {
    id: `test-${idCounter}`,
    owner,
    pieceType,
    card: { rank: '4', suit: 'C' },
    promoted: false,
    ...overrides,
  }
}

function place(board: (Piece | null)[][], square: Square, piece: Piece): void {
  board[square.row][square.col] = piece
}

/** Full 24-piece board: every seat's setup slots filled per engine/types.ts. */
function fullBoard(): BoardModel {
  const board = emptyBoard()
  const kinds: PieceType[] = [
    'pawn',
    'pawn',
    'knight',
    'bishop',
    'rook',
    'queen',
  ]
  for (const seat of SEAT_ORDER) {
    SETUP_SLOTS[seat].forEach((square, i) => {
      place(
        board,
        square,
        makePiece(seat, kinds[i], { card: { rank: '4', suit: 'C' } }),
      )
    })
  }
  return board
}

const noop = () => {}

// ---------------------------------------------------------------------------

describe('Board', () => {
  it('renders exactly 64 square buttons', () => {
    render(
      <Board
        board={emptyBoard()}
        selected={null}
        legalTargets={[]}
        lastMove={null}
        onSquareTap={noop}
        aliveSeats={SEAT_ORDER}
        turn="S"
      />,
    )
    expect(screen.getAllByRole('button')).toHaveLength(64)
  })

  it('renders 24 pieces on a full board, each with glyph, card label, and owner seat colour', () => {
    const { container } = render(
      <Board
        board={fullBoard()}
        selected={null}
        legalTargets={[]}
        lastMove={null}
        onSquareTap={noop}
        aliveSeats={SEAT_ORDER}
        turn="S"
      />,
    )

    const pieceEls = container.querySelectorAll('.piece')
    expect(pieceEls).toHaveLength(24)

    for (const seat of SEAT_ORDER) {
      const seatPieces = container.querySelectorAll(
        `.piece[data-seat="${seat}"]`,
      )
      expect(seatPieces).toHaveLength(6)
      for (const el of Array.from(seatPieces)) {
        expect(el.querySelector('.piece__glyph')).not.toBeNull()
        expect(el.querySelector('.piece__card')?.textContent).toBe('4♣')
        expect(el.querySelector(`.piece__chip--${seat}`)).not.toBeNull()
      }
    }
  })

  it('renders the four corners empty', () => {
    render(
      <Board
        board={fullBoard()}
        selected={null}
        legalTargets={[]}
        lastMove={null}
        onSquareTap={noop}
        aliveSeats={SEAT_ORDER}
        turn="S"
      />,
    )

    const corners: Square[] = [
      { row: 0, col: 0 },
      { row: 0, col: 7 },
      { row: 7, col: 0 },
      { row: 7, col: 7 },
    ]
    for (const corner of corners) {
      const btn = document.querySelector(
        `[data-square="${corner.row},${corner.col}"]`,
      )
      expect(btn).not.toBeNull()
      expect(btn?.querySelector('.piece')).toBeNull()
      expect(btn?.getAttribute('aria-label')).toMatch(/, empty$/)
    }
  })

  it('calls onSquareTap with the tapped square on click', async () => {
    const user = userEvent.setup()
    const onSquareTap = vi.fn()
    render(
      <Board
        board={emptyBoard()}
        selected={null}
        legalTargets={[]}
        lastMove={null}
        onSquareTap={onSquareTap}
        aliveSeats={SEAT_ORDER}
        turn="S"
      />,
    )

    const btn = document.querySelector('[data-square="7,1"]')
    expect(btn).not.toBeNull()
    await user.click(btn as Element)

    expect(onSquareTap).toHaveBeenCalledTimes(1)
    expect(onSquareTap).toHaveBeenCalledWith({ row: 7, col: 1 })
  })

  it('marks selected, legal-target, and last-move squares with data-state', () => {
    const board = emptyBoard()
    place(board, { row: 4, col: 4 }, makePiece('S', 'knight'))
    place(board, { row: 2, col: 3 }, makePiece('W', 'pawn'))

    const selected: Square = { row: 4, col: 4 }
    const legalTargets: Square[] = [
      { row: 3, col: 2 }, // empty target square
      { row: 2, col: 3 }, // occupied -> capture target
    ]
    const lastMove: Move = { from: { row: 6, col: 6 }, to: { row: 5, col: 5 } }

    render(
      <Board
        board={board}
        selected={selected}
        legalTargets={legalTargets}
        lastMove={lastMove}
        onSquareTap={noop}
        aliveSeats={SEAT_ORDER}
        turn="S"
      />,
    )

    expect(
      document.querySelector('[data-square="4,4"]')?.getAttribute('data-state'),
    ).toBe('selected')
    expect(
      document.querySelector('[data-square="3,2"]')?.getAttribute('data-state'),
    ).toBe('target')
    expect(
      document.querySelector('[data-square="2,3"]')?.getAttribute('data-state'),
    ).toBe('capture-target')
    expect(
      document.querySelector('[data-square="6,6"]')?.getAttribute('data-state'),
    ).toBe('last-from')
    expect(
      document.querySelector('[data-square="5,5"]')?.getAttribute('data-state'),
    ).toBe('last-to')
  })

  it('disabled prevents onSquareTap from firing', async () => {
    const user = userEvent.setup()
    const onSquareTap = vi.fn()
    render(
      <Board
        board={emptyBoard()}
        selected={null}
        legalTargets={[]}
        lastMove={null}
        onSquareTap={onSquareTap}
        aliveSeats={SEAT_ORDER}
        turn="S"
        disabled
      />,
    )

    const btn = document.querySelector('[data-square="7,1"]')
    expect(btn).not.toBeNull()
    await user.click(btn as Element)

    expect(onSquareTap).not.toHaveBeenCalled()
  })

  it('renders a promoted pawn with the queen glyph, a promotion marker, and its original card label', () => {
    const board = emptyBoard()
    const promoted = makePiece('N', 'queen', {
      card: { rank: '6', suit: 'H' },
      promoted: true,
    })
    place(board, { row: 0, col: 3 }, promoted)

    render(
      <Board
        board={board}
        selected={null}
        legalTargets={[]}
        lastMove={null}
        onSquareTap={noop}
        aliveSeats={SEAT_ORDER}
        turn="S"
      />,
    )

    const cell = document.querySelector('[data-square="0,3"]')
    expect(cell?.querySelector('.piece__glyph')?.textContent).toBe('♛')
    expect(cell?.querySelector('[data-testid="promo-marker"]')).not.toBeNull()
    expect(cell?.querySelector('.piece__card')?.textContent).toBe('6♥')
  })

  it('leaves a natural (non-promoted) queen without a promotion marker', () => {
    const board = emptyBoard()
    place(
      board,
      { row: 0, col: 3 },
      makePiece('N', 'queen', { card: { rank: 'Q', suit: 'S' } }),
    )

    render(
      <Board
        board={board}
        selected={null}
        legalTargets={[]}
        lastMove={null}
        onSquareTap={noop}
        aliveSeats={SEAT_ORDER}
        turn="S"
      />,
    )

    const cell = document.querySelector('[data-square="0,3"]')
    expect(cell?.querySelector('[data-testid="promo-marker"]')).toBeNull()
  })
})
