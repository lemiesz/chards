import { describe, it, expect } from 'vitest'
import {
  legalMoves,
  allLegalMoves,
  hasAnyLegalMove,
  isLegalMove,
} from './moves'
import {
  BOARD_SIZE,
  type Board,
  type Card,
  type GameState,
  type Piece,
  type PieceType,
  type Seat,
  type Square,
} from './types'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let idCounter = 0

function piece(
  owner: Seat,
  pieceType: PieceType,
  card: Card = { rank: '2', suit: 'C' },
): Piece {
  idCounter += 1
  return { id: `test-${idCounter}`, owner, card, pieceType, promoted: false }
}

interface Placement {
  readonly square: Square
  readonly piece: Piece
}

/** Builds a minimal valid GameState from an empty board plus explicit placements. */
function makeState(pieces: readonly Placement[], turn: Seat = 'S'): GameState {
  const board: (Piece | null)[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array<Piece | null>(BOARD_SIZE).fill(null),
  )
  for (const { square, piece: p } of pieces) {
    board[square.row][square.col] = p
  }
  return {
    board: board as Board,
    turn,
    aliveSeats: ['S', 'W', 'N', 'E'],
    phase: 'playing',
    winner: null,
    captures: [],
    moveCount: 0,
    lastMove: null,
    events: [],
    hands: { S: [], W: [], N: [], E: [] },
    seed: null,
  }
}

function sq(row: number, col: number): Square {
  return { row, col }
}

function sortSquares(squares: readonly Square[]): Square[] {
  return [...squares].sort((a, b) => a.row - b.row || a.col - b.col)
}

function expectSquares(
  actual: readonly Square[],
  expected: readonly Square[],
): void {
  expect(sortSquares(actual)).toEqual(sortSquares(expected))
}

// ---------------------------------------------------------------------------
// Empty-board moves from a central square, per piece type
// ---------------------------------------------------------------------------

describe('legalMoves: empty board, central square, per piece type', () => {
  const from = sq(4, 4)

  it('bishop slides along all four diagonals to the edge', () => {
    const state = makeState([{ square: from, piece: piece('S', 'bishop') }])
    expectSquares(legalMoves(state, from), [
      sq(3, 3),
      sq(2, 2),
      sq(1, 1),
      sq(0, 0),
      sq(3, 5),
      sq(2, 6),
      sq(1, 7),
      sq(5, 3),
      sq(6, 2),
      sq(7, 1),
      sq(5, 5),
      sq(6, 6),
      sq(7, 7),
    ])
  })

  it('rook slides along its rank and file to the edge', () => {
    const state = makeState([{ square: from, piece: piece('S', 'rook') }])
    expectSquares(legalMoves(state, from), [
      sq(4, 0),
      sq(4, 1),
      sq(4, 2),
      sq(4, 3),
      sq(4, 5),
      sq(4, 6),
      sq(4, 7),
      sq(0, 4),
      sq(1, 4),
      sq(2, 4),
      sq(3, 4),
      sq(5, 4),
      sq(6, 4),
      sq(7, 4),
    ])
  })

  it('queen slides along rank, file, and both diagonals', () => {
    const state = makeState([{ square: from, piece: piece('S', 'queen') }])
    expectSquares(legalMoves(state, from), [
      sq(3, 3),
      sq(2, 2),
      sq(1, 1),
      sq(0, 0),
      sq(3, 5),
      sq(2, 6),
      sq(1, 7),
      sq(5, 3),
      sq(6, 2),
      sq(7, 1),
      sq(5, 5),
      sq(6, 6),
      sq(7, 7),
      sq(4, 0),
      sq(4, 1),
      sq(4, 2),
      sq(4, 3),
      sq(4, 5),
      sq(4, 6),
      sq(4, 7),
      sq(0, 4),
      sq(1, 4),
      sq(2, 4),
      sq(3, 4),
      sq(5, 4),
      sq(6, 4),
      sq(7, 4),
    ])
  })

  it('knight jumps all 8 L-shapes', () => {
    const state = makeState([{ square: from, piece: piece('S', 'knight') }])
    expectSquares(legalMoves(state, from), [
      sq(2, 3),
      sq(2, 5),
      sq(3, 2),
      sq(3, 6),
      sq(5, 2),
      sq(5, 6),
      sq(6, 3),
      sq(6, 5),
    ])
  })

  it('king moves 1 square in all 8 directions', () => {
    const state = makeState([{ square: from, piece: piece('S', 'king') }])
    expectSquares(legalMoves(state, from), [
      sq(3, 3),
      sq(3, 4),
      sq(3, 5),
      sq(4, 3),
      sq(4, 5),
      sq(5, 3),
      sq(5, 4),
      sq(5, 5),
    ])
  })

  it('empty square returns no moves', () => {
    const state = makeState([])
    expect(legalMoves(state, from)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Sliders: blocked by friendly, capture-and-stop on enemy
// ---------------------------------------------------------------------------

describe('legalMoves: sliders blocked by pieces', () => {
  it('rook stops before a friendly piece on its path', () => {
    const from = sq(4, 4)
    const state = makeState([
      { square: from, piece: piece('S', 'rook') },
      { square: sq(4, 6), piece: piece('S', 'pawn') },
    ])
    const moves = legalMoves(state, from)
    // Along the blocked direction, only the square just before the blocker.
    expect(moves).toContainEqual(sq(4, 5))
    expect(moves).not.toContainEqual(sq(4, 6))
    expect(moves).not.toContainEqual(sq(4, 7))
  })

  it('rook captures an enemy piece on its path and stops there', () => {
    const from = sq(4, 4)
    const state = makeState([
      { square: from, piece: piece('S', 'rook') },
      { square: sq(4, 6), piece: piece('W', 'pawn') },
    ])
    const moves = legalMoves(state, from)
    expect(moves).toContainEqual(sq(4, 5))
    expect(moves).toContainEqual(sq(4, 6))
    expect(moves).not.toContainEqual(sq(4, 7))
  })

  it('bishop stops before a friendly piece and captures an enemy diagonally', () => {
    const from = sq(4, 4)
    const state = makeState([
      { square: from, piece: piece('S', 'bishop') },
      { square: sq(2, 2), piece: piece('S', 'pawn') },
      { square: sq(6, 6), piece: piece('N', 'pawn') },
    ])
    const moves = legalMoves(state, from)
    expect(moves).toContainEqual(sq(3, 3))
    expect(moves).not.toContainEqual(sq(2, 2))
    expect(moves).not.toContainEqual(sq(1, 1))
    expect(moves).toContainEqual(sq(5, 5))
    expect(moves).toContainEqual(sq(6, 6))
    expect(moves).not.toContainEqual(sq(7, 7))
  })
})

// ---------------------------------------------------------------------------
// Knight: jumps over pieces, clipped at board edges
// ---------------------------------------------------------------------------

describe('legalMoves: knight', () => {
  it('jumps over intervening pieces without being blocked by them', () => {
    const from = sq(4, 4)
    const state = makeState([
      { square: from, piece: piece('S', 'knight') },
      // Pieces adjacent to the knight are not actual knight destinations,
      // and must not obstruct the L-shaped jump.
      { square: sq(3, 4), piece: piece('S', 'pawn') },
      { square: sq(4, 5), piece: piece('W', 'pawn') },
      { square: sq(5, 4), piece: piece('N', 'pawn') },
    ])
    expectSquares(legalMoves(state, from), [
      sq(2, 3),
      sq(2, 5),
      sq(3, 2),
      sq(3, 6),
      sq(5, 2),
      sq(5, 6),
      sq(6, 3),
      sq(6, 5),
    ])
  })

  it('excludes friendly-occupied destinations and includes enemy-occupied captures', () => {
    const from = sq(4, 4)
    const state = makeState([
      { square: from, piece: piece('S', 'knight') },
      { square: sq(2, 3), piece: piece('S', 'pawn') },
      { square: sq(2, 5), piece: piece('E', 'pawn') },
    ])
    const moves = legalMoves(state, from)
    expect(moves).not.toContainEqual(sq(2, 3))
    expect(moves).toContainEqual(sq(2, 5))
    expect(moves).toHaveLength(7)
  })

  it('is clipped to 2 moves from a corner', () => {
    const from = sq(0, 0)
    const state = makeState([{ square: from, piece: piece('S', 'knight') }])
    expectSquares(legalMoves(state, from), [sq(1, 2), sq(2, 1)])
  })
})

// ---------------------------------------------------------------------------
// King: 8 moves, clipped at a corner
// ---------------------------------------------------------------------------

describe('legalMoves: king', () => {
  it('is clipped to 3 moves from a corner', () => {
    const from = sq(0, 0)
    const state = makeState([{ square: from, piece: piece('S', 'king') }])
    expectSquares(legalMoves(state, from), [sq(0, 1), sq(1, 0), sq(1, 1)])
  })

  it('may capture an adjacent enemy and may not move onto a friendly piece', () => {
    const from = sq(4, 4)
    const state = makeState([
      { square: from, piece: piece('S', 'king') },
      { square: sq(3, 4), piece: piece('S', 'pawn') },
      { square: sq(4, 5), piece: piece('N', 'pawn') },
    ])
    const moves = legalMoves(state, from)
    expect(moves).not.toContainEqual(sq(3, 4))
    expect(moves).toContainEqual(sq(4, 5))
    expect(moves).toHaveLength(7)
  })
})

// ---------------------------------------------------------------------------
// Pawns: direction per seat, blocking, captures, promotion-edge stall
// ---------------------------------------------------------------------------

interface PawnCase {
  readonly seat: Seat
  readonly start: Square
  readonly forward: Square
  readonly diagA: Square
  readonly diagB: Square
  readonly farEdge: Square
}

const PAWN_CASES: readonly PawnCase[] = [
  {
    seat: 'S',
    start: sq(4, 4),
    forward: sq(3, 4),
    diagA: sq(3, 3),
    diagB: sq(3, 5),
    farEdge: sq(0, 4),
  },
  {
    seat: 'W',
    start: sq(4, 4),
    forward: sq(4, 5),
    diagA: sq(3, 5),
    diagB: sq(5, 5),
    farEdge: sq(4, 7),
  },
  {
    seat: 'N',
    start: sq(4, 4),
    forward: sq(5, 4),
    diagA: sq(5, 3),
    diagB: sq(5, 5),
    farEdge: sq(7, 4),
  },
  {
    seat: 'E',
    start: sq(4, 4),
    forward: sq(4, 3),
    diagA: sq(3, 3),
    diagB: sq(5, 3),
    farEdge: sq(4, 0),
  },
]

describe.each(PAWN_CASES)('legalMoves: pawn direction for seat $seat', (c) => {
  it('advances one square forward on an empty board (no diagonals)', () => {
    const state = makeState([{ square: c.start, piece: piece(c.seat, 'pawn') }])
    expectSquares(legalMoves(state, c.start), [c.forward])
  })

  it('forward move is blocked by any piece (friendly or enemy) directly ahead', () => {
    const enemySeat = otherSeat(c.seat)
    const friendlyBlocked = makeState([
      { square: c.start, piece: piece(c.seat, 'pawn') },
      { square: c.forward, piece: piece(c.seat, 'rook') },
    ])
    expect(legalMoves(friendlyBlocked, c.start)).toEqual([])

    const enemyBlocked = makeState([
      { square: c.start, piece: piece(c.seat, 'pawn') },
      { square: c.forward, piece: piece(enemySeat, 'rook') },
    ])
    // Pawns do not capture straight ahead, even against an enemy.
    expect(legalMoves(enemyBlocked, c.start)).toEqual([])
  })

  it('captures an enemy diagonally forward', () => {
    const enemySeat = otherSeat(c.seat)
    const state = makeState([
      { square: c.start, piece: piece(c.seat, 'pawn') },
      { square: c.diagA, piece: piece(enemySeat, 'pawn') },
      { square: c.diagB, piece: piece(enemySeat, 'pawn') },
    ])
    expectSquares(legalMoves(state, c.start), [c.forward, c.diagA, c.diagB])
  })

  it('does not move diagonally onto an empty square', () => {
    const state = makeState([{ square: c.start, piece: piece(c.seat, 'pawn') }])
    const moves = legalMoves(state, c.start)
    expect(moves).not.toContainEqual(c.diagA)
    expect(moves).not.toContainEqual(c.diagB)
  })

  it('does not capture a friendly piece diagonally', () => {
    const state = makeState([
      { square: c.start, piece: piece(c.seat, 'pawn') },
      { square: c.diagA, piece: piece(c.seat, 'knight') },
    ])
    const moves = legalMoves(state, c.start)
    expect(moves).not.toContainEqual(c.diagA)
    expectSquares(moves, [c.forward])
  })

  it('has no forward move when already on the far edge', () => {
    const state = makeState([
      { square: c.farEdge, piece: piece(c.seat, 'pawn') },
    ])
    expect(legalMoves(state, c.farEdge)).toEqual([])
  })
})

function otherSeat(seat: Seat): Seat {
  const order: Seat[] = ['S', 'W', 'N', 'E']
  return order[(order.indexOf(seat) + 1) % 4]
}

// ---------------------------------------------------------------------------
// Capturing any of the three other seats
// ---------------------------------------------------------------------------

describe('legalMoves: capturing opponents of any seat', () => {
  it('a queen may capture pieces belonging to each of the three other seats', () => {
    const from = sq(4, 4)
    const state = makeState([
      { square: from, piece: piece('S', 'queen') },
      { square: sq(4, 6), piece: piece('W', 'pawn') }, // along the rank
      { square: sq(6, 4), piece: piece('N', 'pawn') }, // along the file
      { square: sq(6, 2), piece: piece('E', 'pawn') }, // along a diagonal
    ])
    const moves = legalMoves(state, from)
    expect(moves).toContainEqual(sq(4, 6))
    expect(moves).toContainEqual(sq(6, 4))
    expect(moves).toContainEqual(sq(6, 2))
    // Blocked-and-stopped beyond each capture.
    expect(moves).not.toContainEqual(sq(4, 7))
    expect(moves).not.toContainEqual(sq(7, 4))
    expect(moves).not.toContainEqual(sq(7, 1))
  })
})

// ---------------------------------------------------------------------------
// allLegalMoves / hasAnyLegalMove / isLegalMove
// ---------------------------------------------------------------------------

describe('allLegalMoves', () => {
  it("aggregates legal moves across all of a seat's pieces, and ignores other seats", () => {
    const knightSq = sq(0, 0) // 2 moves from a corner
    const kingSq = sq(4, 4) // 8 moves from the center
    const state = makeState([
      { square: knightSq, piece: piece('S', 'knight') },
      { square: kingSq, piece: piece('S', 'king') },
      { square: sq(7, 7), piece: piece('W', 'queen') },
    ])
    const moves = allLegalMoves(state, 'S')
    expect(moves).toHaveLength(2 + 8)
    expect(
      moves.every(
        (m) =>
          (m.from.row === 0 && m.from.col === 0) ||
          (m.from.row === 4 && m.from.col === 4),
      ),
    ).toBe(true)
  })

  it('returns an empty array for a seat with no pieces', () => {
    const state = makeState([{ square: sq(4, 4), piece: piece('W', 'queen') }])
    expect(allLegalMoves(state, 'S')).toEqual([])
  })
})

describe('hasAnyLegalMove', () => {
  it('is true when at least one piece of the seat can move', () => {
    const state = makeState([{ square: sq(4, 4), piece: piece('S', 'pawn') }])
    expect(hasAnyLegalMove(state, 'S')).toBe(true)
  })

  it('is false when the seat is fully boxed in with no legal moves anywhere', () => {
    // Every S piece below has zero legal moves:
    // - king at (0,0): all 3 in-bounds neighbors occupied by friendly pawns.
    // - pawn at (0,1): already on its far edge (row 0) -> no forward move; no enemy to capture.
    // - pawn at (1,0): forward square (0,0) occupied by friendly king; no enemy diagonally.
    // - pawn at (1,1): forward square (0,1) occupied by friendly pawn; diagonals are friendly/empty.
    const state = makeState([
      { square: sq(0, 0), piece: piece('S', 'king') },
      { square: sq(0, 1), piece: piece('S', 'pawn') },
      { square: sq(1, 0), piece: piece('S', 'pawn') },
      { square: sq(1, 1), piece: piece('S', 'pawn') },
      // An enemy elsewhere with plenty of moves, to prove the check is seat-specific.
      { square: sq(6, 6), piece: piece('W', 'queen') },
    ])
    expect(hasAnyLegalMove(state, 'S')).toBe(false)
    expect(allLegalMoves(state, 'S')).toEqual([])
    expect(hasAnyLegalMove(state, 'W')).toBe(true)
  })
})

describe('isLegalMove', () => {
  it('returns true for a move present in legalMoves and false otherwise', () => {
    const from = sq(4, 4)
    const state = makeState([{ square: from, piece: piece('S', 'rook') }])
    expect(isLegalMove(state, { from, to: sq(4, 0) })).toBe(true)
    expect(isLegalMove(state, { from, to: sq(5, 5) })).toBe(false)
  })

  it('returns false for a move from an empty square', () => {
    const state = makeState([])
    expect(isLegalMove(state, { from: sq(4, 4), to: sq(4, 5) })).toBe(false)
  })
})
