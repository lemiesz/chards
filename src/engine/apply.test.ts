import { describe, it, expect } from 'vitest'
import {
  applyMove,
  canApply,
  pieceCounts,
  findSeatPieces,
  resetBoard,
} from './apply'
import { allLegalMoves } from './moves'
import { newGame } from './setup'
import { makeRng } from './deck'
import {
  BOARD_SIZE,
  SEAT_ORDER,
  SETUP_SLOTS,
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
  promoted = false,
): Piece {
  idCounter += 1
  return { id: `test-${idCounter}`, owner, card, pieceType, promoted }
}

interface Placement {
  readonly square: Square
  readonly piece: Piece
}

function emptyBoard(): (Piece | null)[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array<Piece | null>(BOARD_SIZE).fill(null),
  )
}

/** Builds a minimal valid GameState from an empty board plus explicit placements. */
function makeState(
  pieces: readonly Placement[],
  overrides: Partial<GameState> = {},
): GameState {
  const board = emptyBoard()
  for (const { square, piece: p } of pieces) {
    board[square.row][square.col] = p
  }
  return {
    board: board as Board,
    turn: 'S',
    aliveSeats: ['S', 'W', 'N', 'E'],
    phase: 'playing',
    winner: null,
    captures: [],
    moveCount: 0,
    lastMove: null,
    events: [],
    hands: { S: [], W: [], N: [], E: [] },
    seed: null,
    ...overrides,
  }
}

function sq(row: number, col: number): Square {
  return { row, col }
}

// ---------------------------------------------------------------------------
// Validation / rejection
// ---------------------------------------------------------------------------

describe('applyMove validation', () => {
  it('rejects a move when the game is not in phase "playing"', () => {
    const state = makeState([{ square: sq(4, 4), piece: piece('S', 'rook') }], {
      phase: 'finished',
      winner: 'S',
    })
    const move = { from: sq(4, 4), to: sq(4, 0) }
    expect(() => applyMove(state, move)).toThrow()
    expect(canApply(state, move)).toBe(false)
  })

  it('rejects a move from an empty square', () => {
    const state = makeState([])
    const move = { from: sq(4, 4), to: sq(4, 0) }
    expect(() => applyMove(state, move)).toThrow()
    expect(canApply(state, move)).toBe(false)
  })

  it('rejects moving a piece owned by another seat', () => {
    const state = makeState([{ square: sq(4, 4), piece: piece('W', 'rook') }], {
      turn: 'S',
    })
    const move = { from: sq(4, 4), to: sq(4, 0) }
    expect(() => applyMove(state, move)).toThrow()
    expect(canApply(state, move)).toBe(false)
  })

  it('rejects an illegal destination for the piece', () => {
    const state = makeState([{ square: sq(4, 4), piece: piece('S', 'rook') }], {
      turn: 'S',
    })
    // A rook cannot move like a knight.
    const move = { from: sq(4, 4), to: sq(5, 6) }
    expect(() => applyMove(state, move)).toThrow()
    expect(canApply(state, move)).toBe(false)
  })

  it('canApply returns true for a legal move', () => {
    const state = makeState([{ square: sq(4, 4), piece: piece('S', 'rook') }], {
      turn: 'S',
    })
    const move = { from: sq(4, 4), to: sq(4, 0) }
    expect(canApply(state, move)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Simple move
// ---------------------------------------------------------------------------

// A layout where every seat has at least one piece with a legal move, so a
// single move never cascades into auto-skips of the other three seats.
function fourSeatLayout(): Placement[] {
  return [
    { square: sq(7, 4), piece: piece('S', 'rook') },
    { square: sq(4, 0), piece: piece('W', 'rook') },
    { square: sq(0, 4), piece: piece('N', 'rook') },
    { square: sq(4, 7), piece: piece('E', 'rook') },
  ]
}

describe('applyMove: simple move', () => {
  it('updates the board, clears the source, increments moveCount, sets lastMove', () => {
    const layout = fourSeatLayout()
    const rook = layout[0].piece
    const state = makeState(layout, {
      turn: 'S',
      moveCount: 5,
      events: [{ type: 'draw' }],
    })
    const move = { from: sq(7, 4), to: sq(7, 7) }
    const next = applyMove(state, move)

    expect(next.board[7][4]).toBeNull()
    expect(next.board[7][7]).toEqual(rook)
    expect(next.moveCount).toBe(6)
    expect(next.lastMove).toEqual(move)
    expect(next.events).toEqual([{ type: 'move', seat: 'S', move }])
  })

  it('does not leak events from the previous state', () => {
    const layout = fourSeatLayout()
    const state = makeState(layout, {
      turn: 'S',
      events: [{ type: 'skip', seat: 'E' }, { type: 'draw' }],
    })
    const next = applyMove(state, { from: sq(7, 4), to: sq(7, 7) })
    expect(next.events).not.toContainEqual({ type: 'skip', seat: 'E' })
    expect(next.events).not.toContainEqual({ type: 'draw' })
  })

  it('advances turn clockwise S -> W -> N -> E -> S', () => {
    const layout: Placement[] = [
      { square: sq(7, 4), piece: piece('S', 'rook') },
      { square: sq(4, 0), piece: piece('W', 'rook') },
      { square: sq(0, 4), piece: piece('N', 'rook') },
      { square: sq(4, 7), piece: piece('E', 'rook') },
    ]
    const moveFor: Record<Seat, { from: Square; to: Square }> = {
      S: { from: sq(7, 4), to: sq(7, 7) },
      W: { from: sq(4, 0), to: sq(7, 0) },
      N: { from: sq(0, 4), to: sq(0, 0) },
      E: { from: sq(4, 7), to: sq(0, 7) },
    }
    const expectedNext: Record<Seat, Seat> = { S: 'W', W: 'N', N: 'E', E: 'S' }

    for (const turn of SEAT_ORDER) {
      const state = makeState(layout, { turn })
      const next = applyMove(state, moveFor[turn])
      expect(next.turn).toBe(expectedNext[turn])
    }
  })
})

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe('applyMove: immutability', () => {
  it('never mutates the input state or its board', () => {
    const rook = piece('S', 'rook')
    const wPawn = piece('W', 'pawn')
    const state = makeState(
      [
        { square: sq(4, 4), piece: rook },
        { square: sq(4, 0), piece: wPawn },
      ],
      { turn: 'S' },
    )
    const snapshot = JSON.parse(JSON.stringify(state))

    const next = applyMove(state, { from: sq(4, 4), to: sq(4, 0) })

    expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot)
    expect(next).not.toBe(state)
    expect(next.board).not.toBe(state.board)
  })
})

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

describe('applyMove: capture', () => {
  it('removes the captured piece, records it, and emits a capture event', () => {
    const rook = piece('S', 'rook')
    const wPawn = piece('W', 'pawn')
    const wKnight = piece('W', 'knight') // keeps W alive after the capture
    const state = makeState(
      [
        { square: sq(4, 4), piece: rook },
        { square: sq(4, 0), piece: wPawn },
        { square: sq(0, 0), piece: wKnight },
      ],
      { turn: 'S', moveCount: 9 },
    )

    const next = applyMove(state, { from: sq(4, 4), to: sq(4, 0) })

    expect(next.board[4][0]).toEqual(rook)
    expect(next.board[4][4]).toBeNull()
    expect(next.captures).toHaveLength(1)
    expect(next.captures[0]).toEqual({ piece: wPawn, by: 'S', moveNumber: 10 })
    expect(next.events).toContainEqual({
      type: 'capture',
      by: 'S',
      piece: wPawn,
    })
    // W survives (still has the knight), so no elimination/reset.
    expect(next.events.some((e) => e.type === 'elimination')).toBe(false)
    expect(next.aliveSeats).toEqual(['S', 'W', 'N', 'E'])
  })
})

// ---------------------------------------------------------------------------
// Promotion
// ---------------------------------------------------------------------------

describe('applyMove: promotion', () => {
  const cases: {
    seat: Seat
    from: Square
    to: Square
  }[] = [
    { seat: 'S', from: sq(1, 4), to: sq(0, 4) }, // S promotes at row 0
    { seat: 'W', from: sq(4, 6), to: sq(4, 7) }, // W promotes at col 7
    { seat: 'N', from: sq(6, 4), to: sq(7, 4) }, // N promotes at row 7
    { seat: 'E', from: sq(4, 1), to: sq(4, 0) }, // E promotes at col 0
  ]

  for (const { seat, from, to } of cases) {
    it(`promotes ${seat}'s pawn to a queen when it reaches its far edge`, () => {
      const card: Card = { rank: '6', suit: 'H' }
      const pawn = piece(seat, 'pawn', card)
      const state = makeState([{ square: from, piece: pawn }], { turn: seat })

      const next = applyMove(state, { from, to })
      const promoted = next.board[to.row][to.col]

      expect(promoted).not.toBeNull()
      expect(promoted!.pieceType).toBe('queen')
      expect(promoted!.promoted).toBe(true)
      expect(promoted!.card).toEqual(card) // card unchanged
      expect(promoted!.id).toBe(pawn.id)
      expect(next.events).toContainEqual({ type: 'promotion', seat, at: to })
    })
  }

  it('does not promote a pawn that does not reach the far edge', () => {
    const pawn = piece('S', 'pawn', { rank: '6', suit: 'H' })
    const state = makeState([{ square: sq(5, 4), piece: pawn }], { turn: 'S' })
    const next = applyMove(state, { from: sq(5, 4), to: sq(4, 4) })

    const moved = next.board[4][4]
    expect(moved!.pieceType).toBe('pawn')
    expect(moved!.promoted).toBe(false)
    expect(next.events.some((e) => e.type === 'promotion')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Elimination + board reset
// ---------------------------------------------------------------------------

describe('applyMove: elimination + reset', () => {
  it('resets a 6-piece survivor onto SETUP_SLOTS ascending by value, C<D<H<S tie-break', () => {
    const sRook = piece('S', 'rook', { rank: '10', suit: 'S' })
    const wPawn = piece('W', 'pawn', { rank: '4', suit: 'D' }) // W's only piece
    const nAc = piece('N', 'bishop', { rank: 'A', suit: 'C' }) // value 1
    const n2d = piece('N', 'pawn', { rank: '2', suit: 'D' }) // value 2
    const n5c = piece('N', 'pawn', { rank: '5', suit: 'C' }) // value 5, club
    const n5h = piece('N', 'pawn', { rank: '5', suit: 'H' }) // value 5, heart
    const n9s = piece('N', 'pawn', { rank: '9', suit: 'S' }) // value 9
    const nQc = piece('N', 'queen', { rank: 'Q', suit: 'C' }) // value 12

    const state = makeState(
      [
        { square: sq(4, 4), piece: sRook },
        { square: sq(4, 0), piece: wPawn },
        { square: sq(3, 1), piece: nAc },
        { square: sq(3, 2), piece: n2d },
        { square: sq(3, 3), piece: n5c },
        { square: sq(3, 4), piece: n5h },
        { square: sq(3, 5), piece: n9s },
        { square: sq(3, 6), piece: nQc },
      ],
      { turn: 'S', aliveSeats: ['S', 'W', 'N'] },
    )

    const next = applyMove(state, { from: sq(4, 4), to: sq(4, 0) })

    expect(next.aliveSeats).toEqual(['S', 'N'])
    expect(next.events).toContainEqual({ type: 'elimination', seat: 'W' })
    expect(next.events).toContainEqual({ type: 'reset' })
    const elimIndex = next.events.findIndex((e) => e.type === 'elimination')
    const resetIndex = next.events.findIndex((e) => e.type === 'reset')
    expect(resetIndex).toBeGreaterThan(elimIndex)

    // S: lone survivor piece goes to slot 0.
    const sSlots = SETUP_SLOTS.S
    expect(next.board[sSlots[0].row][sSlots[0].col]).toEqual(sRook)

    // N: 6 pieces sorted ascending by pointValue, ties broken C<D<H<S.
    const nSlots = SETUP_SLOTS.N
    expect(next.board[nSlots[0].row][nSlots[0].col]).toEqual(nAc)
    expect(next.board[nSlots[1].row][nSlots[1].col]).toEqual(n2d)
    expect(next.board[nSlots[2].row][nSlots[2].col]).toEqual(n5c)
    expect(next.board[nSlots[3].row][nSlots[3].col]).toEqual(n5h)
    expect(next.board[nSlots[4].row][nSlots[4].col]).toEqual(n9s)
    expect(next.board[nSlots[5].row][nSlots[5].col]).toEqual(nQc)

    // Full-board assertion: exactly 7 pieces remain (1 + 6), nothing stray.
    let filled = 0
    for (const row of next.board) {
      for (const cell of row) if (cell !== null) filled += 1
    }
    expect(filled).toBe(7)

    // Turn continues clockwise from the eliminator (S), skipping dead W.
    expect(next.turn).toBe('N')
  })

  it('fills only the first slots for a 3-piece survivor, leaving the rest empty; the eliminated seat edge is fully empty', () => {
    const sRook = piece('S', 'rook', { rank: '10', suit: 'S' })
    const wPawn = piece('W', 'pawn', { rank: '4', suit: 'D' })
    const n7 = piece('N', 'pawn', { rank: '7', suit: 'H' })
    const n3 = piece('N', 'pawn', { rank: '3', suit: 'C' })
    const nK = piece('N', 'king', { rank: 'K', suit: 'S' })

    const state = makeState(
      [
        { square: sq(4, 4), piece: sRook },
        { square: sq(4, 0), piece: wPawn },
        { square: sq(2, 2), piece: n7 },
        { square: sq(2, 3), piece: n3 },
        { square: sq(2, 4), piece: nK },
      ],
      { turn: 'S', aliveSeats: ['S', 'W', 'N'] },
    )

    const next = applyMove(state, { from: sq(4, 4), to: sq(4, 0) })

    const nSlots = SETUP_SLOTS.N
    expect(next.board[nSlots[0].row][nSlots[0].col]).toEqual(n3)
    expect(next.board[nSlots[1].row][nSlots[1].col]).toEqual(n7)
    expect(next.board[nSlots[2].row][nSlots[2].col]).toEqual(nK)
    expect(next.board[nSlots[3].row][nSlots[3].col]).toBeNull()
    expect(next.board[nSlots[4].row][nSlots[4].col]).toBeNull()
    expect(next.board[nSlots[5].row][nSlots[5].col]).toBeNull()

    for (const slot of SETUP_SLOTS.W) {
      expect(next.board[slot.row][slot.col]).toBeNull()
    }
  })

  it('keeps a promoted queen as queen/promoted through a reset, sorted by its original card value', () => {
    const sRook = piece('S', 'rook', { rank: '10', suit: 'S' })
    const wPawn = piece('W', 'pawn', { rank: '4', suit: 'D' })
    const promotedQueen = piece('N', 'queen', { rank: '3', suit: 'C' }, true)
    const n7 = piece('N', 'pawn', { rank: '7', suit: 'H' })

    const state = makeState(
      [
        { square: sq(4, 4), piece: sRook },
        { square: sq(4, 0), piece: wPawn },
        { square: sq(2, 2), piece: promotedQueen },
        { square: sq(2, 3), piece: n7 },
      ],
      { turn: 'S', aliveSeats: ['S', 'W', 'N'] },
    )

    const next = applyMove(state, { from: sq(4, 4), to: sq(4, 0) })

    const nSlots = SETUP_SLOTS.N
    // Promoted 3 sorts before unpromoted 7 (original card value used).
    expect(next.board[nSlots[0].row][nSlots[0].col]).toEqual(promotedQueen)
    expect(next.board[nSlots[1].row][nSlots[1].col]).toEqual(n7)
    expect(next.board[nSlots[0].row][nSlots[0].col]!.pieceType).toBe('queen')
    expect(next.board[nSlots[0].row][nSlots[0].col]!.promoted).toBe(true)
  })
})

describe('resetBoard (unit)', () => {
  it('places nothing on an eliminated (non-alive) seat edge', () => {
    const n7 = piece('N', 'pawn', { rank: '7', suit: 'H' })
    const board = emptyBoard()
    board[3][3] = n7
    const wPawn = piece('W', 'pawn', { rank: '4', suit: 'D' })
    board[3][4] = wPawn

    const result = resetBoard(board as Board, ['N'])
    for (const slot of SETUP_SLOTS.W) {
      expect(result[slot.row][slot.col]).toBeNull()
    }
    expect(result[SETUP_SLOTS.N[0].row][SETUP_SLOTS.N[0].col]).toEqual(n7)
  })
})

// ---------------------------------------------------------------------------
// Win
// ---------------------------------------------------------------------------

describe('applyMove: win', () => {
  it('sets phase finished and winner when eliminating the second-to-last opponent', () => {
    const sRook = piece('S', 'rook')
    const nPawn = piece('N', 'pawn')
    const state = makeState(
      [
        { square: sq(4, 4), piece: sRook },
        { square: sq(4, 0), piece: nPawn },
      ],
      { turn: 'S', aliveSeats: ['S', 'N'] },
    )

    const next = applyMove(state, { from: sq(4, 4), to: sq(4, 0) })

    expect(next.phase).toBe('finished')
    expect(next.winner).toBe('S')
    expect(next.aliveSeats).toEqual(['S'])
    expect(next.events).toContainEqual({ type: 'win', seat: 'S' })
  })
})

// ---------------------------------------------------------------------------
// Skip
// ---------------------------------------------------------------------------

describe('applyMove: skip', () => {
  it('skips a seat with no legal moves and emits a skip event', () => {
    const sMover = piece('S', 'rook')
    const sBlocker = piece('S', 'pawn') // blocks W's pawn's forward square
    const wPawn = piece('W', 'pawn') // has 0 legal moves (blocked, no capture)
    const nRook = piece('N', 'rook') // has legal moves

    const state = makeState(
      [
        { square: sq(6, 6), piece: sMover },
        { square: sq(4, 1), piece: sBlocker },
        { square: sq(4, 0), piece: wPawn },
        { square: sq(0, 0), piece: nRook },
      ],
      { turn: 'S', aliveSeats: ['S', 'W', 'N'] },
    )

    const next = applyMove(state, { from: sq(6, 6), to: sq(6, 0) })

    expect(next.events).toContainEqual({ type: 'skip', seat: 'W' })
    expect(next.turn).toBe('N')
    expect(next.phase).toBe('playing')
  })
})

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------

describe('applyMove: draw', () => {
  it('ends in a draw without hanging when no alive seat can move', () => {
    const sPawn = piece('S', 'pawn', { rank: '2', suit: 'C' })
    const nPawn = piece('N', 'pawn', { rank: '2', suit: 'D' })
    const state = makeState(
      [
        { square: sq(2, 0), piece: sPawn },
        { square: sq(0, 0), piece: nPawn },
      ],
      { turn: 'S', aliveSeats: ['S', 'N'] },
    )

    const next = applyMove(state, { from: sq(2, 0), to: sq(1, 0) })

    expect(next.phase).toBe('draw')
    expect(next.winner).toBeNull()
    expect(next.events).toContainEqual({ type: 'skip', seat: 'N' })
    expect(next.events).toContainEqual({ type: 'draw' })
    expect(next.events[next.events.length - 1]).toEqual({ type: 'draw' })
  })
})

// ---------------------------------------------------------------------------
// Full-game scripted test
// ---------------------------------------------------------------------------

describe('applyMove: full game', () => {
  it('drives newGame to completion without throwing, respecting invariants every move', () => {
    let state = newGame({ seed: 777 })
    const rng = makeRng(999)

    let prevPieceCount = 24
    let prevAliveCount = state.aliveSeats.length

    const MAX_ITERATIONS = 2000
    let iterations = 0

    while (state.phase === 'playing' && iterations < MAX_ITERATIONS) {
      iterations += 1

      const moves = allLegalMoves(state, state.turn)
      expect(moves.length).toBeGreaterThan(0)

      const captureMoves = moves.filter(
        (m) => state.board[m.to.row][m.to.col] !== null,
      )
      const pool = captureMoves.length > 0 ? captureMoves : moves
      const index = Math.min(Math.floor(rng() * pool.length), pool.length - 1)
      const move = pool[index]

      state = applyMove(state, move)

      const counts = pieceCounts(state.board)
      const totalPieces = Object.values(counts).reduce((a, b) => a + b, 0)
      expect(totalPieces).toBeLessThanOrEqual(prevPieceCount)
      prevPieceCount = totalPieces

      expect(state.aliveSeats.length).toBeLessThanOrEqual(prevAliveCount)
      prevAliveCount = state.aliveSeats.length

      for (const seat of SEAT_ORDER) {
        if (state.aliveSeats.includes(seat)) {
          expect(counts[seat]).toBeGreaterThanOrEqual(1)
        } else {
          expect(counts[seat]).toBe(0)
        }
      }
    }

    expect(
      state.phase,
      `full-game test did not reach finished/draw within ${MAX_ITERATIONS} moves`,
    ).not.toBe('playing')

    if (state.phase === 'finished') {
      expect(state.winner).not.toBeNull()
      expect(state.aliveSeats).toEqual([state.winner])
    } else {
      expect(state.phase).toBe('draw')
      expect(state.winner).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// pieceCounts / findSeatPieces helpers
// ---------------------------------------------------------------------------

describe('pieceCounts', () => {
  it('counts pieces per seat on the board', () => {
    const board = emptyBoard()
    board[0][0] = piece('S', 'pawn')
    board[0][1] = piece('S', 'pawn')
    board[1][0] = piece('W', 'rook')
    expect(pieceCounts(board as Board)).toEqual({ S: 2, W: 1, N: 0, E: 0 })
  })
})

describe('findSeatPieces', () => {
  it('returns every square+piece owned by a seat', () => {
    const board = emptyBoard()
    const a = piece('S', 'pawn')
    const b = piece('S', 'rook')
    board[0][0] = a
    board[3][3] = b
    board[1][0] = piece('W', 'rook')

    const found = findSeatPieces(board as Board, 'S')
    expect(found).toHaveLength(2)
    expect(found).toContainEqual({ square: sq(0, 0), piece: a })
    expect(found).toContainEqual({ square: sq(3, 3), piece: b })
  })
})
