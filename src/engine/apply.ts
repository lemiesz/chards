/**
 * applyMove: capture, promotion, elimination, board reset, turn advance,
 * win/draw detection (PLAN.md §1.5, §1.6, §1.7).
 *
 * Pure TypeScript, no DOM/React imports (see engine/types.ts architecture rule).
 */

import { nextSeat } from './setup'
import { hasAnyLegalMove, isLegalMove } from './moves'
import {
  BOARD_SIZE,
  PROMOTION_EDGE,
  SETUP_SLOTS,
  SUIT_ORDER,
  pieceAt,
  pointValue,
  type Board,
  type CaptureRecord,
  type GameEvent,
  type GameState,
  type Move,
  type Piece,
  type Seat,
  type Square,
} from './types'

// ---------------------------------------------------------------------------
// Small board helpers
// ---------------------------------------------------------------------------

/** Deep-clones a board into a fresh mutable 2D array (never mutates `board`). */
function cloneBoard(board: Board): (Piece | null)[][] {
  return board.map((row) => row.slice())
}

/** Number of pieces each seat currently has on the board. */
export function pieceCounts(board: Board): Record<Seat, number> {
  const counts: Record<Seat, number> = { S: 0, W: 0, N: 0, E: 0 }
  for (const row of board) {
    for (const cell of row) {
      if (cell !== null) counts[cell.owner] += 1
    }
  }
  return counts
}

/** Every piece currently on the board owned by `seat`, with its square. */
export function findSeatPieces(
  board: Board,
  seat: Seat,
): { square: Square; piece: Piece }[] {
  const found: { square: Square; piece: Piece }[] = []
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const cell = board[row][col]
      if (cell !== null && cell.owner === seat) {
        found.push({ square: { row, col }, piece: cell })
      }
    }
  }
  return found
}

/**
 * Re-places every surviving seat's on-board pieces onto its own SETUP_SLOTS,
 * slot index 0 upward, sorted ascending by pointValue(card), ties broken by
 * SUIT_ORDER (C < D < H < S). Seats not in `aliveSeats` are left empty.
 * Pieces beyond the 6 available slots (should not happen with a 52-card
 * deck / 6-card hands, but guarded for safety) are dropped.
 */
export function resetBoard(board: Board, aliveSeats: readonly Seat[]): Board {
  const next: (Piece | null)[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array<Piece | null>(BOARD_SIZE).fill(null),
  )

  const alive = new Set(aliveSeats)
  for (const seat of alive) {
    const pieces = findSeatPieces(board, seat)
      .map((entry) => entry.piece)
      .slice()
      .sort((a, b) => {
        const diff = pointValue(a.card) - pointValue(b.card)
        if (diff !== 0) return diff
        return SUIT_ORDER[a.card.suit] - SUIT_ORDER[b.card.suit]
      })

    const slots = SETUP_SLOTS[seat]
    for (let i = 0; i < pieces.length && i < slots.length; i++) {
      const slot = slots[i]
      next[slot.row][slot.col] = pieces[i]
    }
  }

  return next
}

// ---------------------------------------------------------------------------
// applyMove
// ---------------------------------------------------------------------------

/** True iff `applyMove(state, move)` would succeed without throwing. */
export function canApply(state: GameState, move: Move): boolean {
  if (state.phase !== 'playing') return false
  const piece = pieceAt(state.board, move.from)
  if (piece === null) return false
  if (piece.owner !== state.turn) return false
  if (!isLegalMove(state, move)) return false
  return true
}

/**
 * Applies `move` to `state`, returning a brand-new GameState. Never mutates
 * `state` or any array/object reachable from it. Throws a descriptive Error
 * if the move is not legal for the seat whose turn it is.
 */
export function applyMove(state: GameState, move: Move): GameState {
  if (state.phase !== 'playing') {
    throw new Error(
      `applyMove: game is not in phase 'playing' (phase is '${state.phase}')`,
    )
  }

  const movingPiece = pieceAt(state.board, move.from)
  if (movingPiece === null) {
    throw new Error(
      `applyMove: no piece at from-square (${move.from.row}, ${move.from.col})`,
    )
  }
  if (movingPiece.owner !== state.turn) {
    throw new Error(
      `applyMove: it is ${state.turn}'s turn, but the piece at (${move.from.row}, ${move.from.col}) is owned by ${movingPiece.owner}`,
    )
  }
  if (!isLegalMove(state, move)) {
    throw new Error(
      `applyMove: illegal move from (${move.from.row}, ${move.from.col}) to (${move.to.row}, ${move.to.col})`,
    )
  }

  const mover = state.turn
  const events: GameEvent[] = [{ type: 'move', seat: mover, move }]

  const board = cloneBoard(state.board)
  const capturedPiece = board[move.to.row][move.to.col]

  let captures = state.captures
  if (capturedPiece !== null) {
    const record: CaptureRecord = {
      piece: capturedPiece,
      by: mover,
      moveNumber: state.moveCount + 1,
    }
    captures = [...state.captures, record]
    events.push({ type: 'capture', by: mover, piece: capturedPiece })
  }

  board[move.from.row][move.from.col] = null

  // Promotion: pawn reaching its owner's far edge becomes a queen. Card is
  // unchanged, so reset ordering still uses the original point value.
  let placedPiece: Piece = movingPiece
  if (movingPiece.pieceType === 'pawn') {
    const edge = PROMOTION_EDGE[movingPiece.owner]
    const reachedEdge =
      edge.axis === 'row'
        ? move.to.row === edge.index
        : move.to.col === edge.index
    if (reachedEdge) {
      placedPiece = { ...movingPiece, pieceType: 'queen', promoted: true }
      events.push({ type: 'promotion', seat: mover, at: move.to })
    }
  }

  board[move.to.row][move.to.col] = placedPiece

  // Elimination + reset.
  let aliveSeats = state.aliveSeats
  if (capturedPiece !== null) {
    const capturedOwner = capturedPiece.owner
    const stillHasPieces = pieceCounts(board)[capturedOwner] > 0
    if (!stillHasPieces && aliveSeats.includes(capturedOwner)) {
      aliveSeats = aliveSeats.filter((seat) => seat !== capturedOwner)
      events.push({ type: 'elimination', seat: capturedOwner })

      const resettedBoard = resetBoard(board, aliveSeats)
      // Replace board contents in place (still a fresh clone, no aliasing).
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          board[row][col] = resettedBoard[row][col]
        }
      }
      events.push({ type: 'reset' })
    }
  }

  // Win: only one seat remains alive.
  if (aliveSeats.length === 1) {
    const winner = aliveSeats[0]
    events.push({ type: 'win', seat: winner })
    return {
      ...state,
      board,
      turn: winner,
      aliveSeats,
      phase: 'finished',
      winner,
      captures,
      moveCount: state.moveCount + 1,
      lastMove: move,
      events,
    }
  }

  // Turn advance, with auto-skip for seats with no legal move.
  let turn = nextSeat(mover, aliveSeats)
  let phase: GameState['phase'] = 'playing'
  let winner: Seat | null = null

  const partialState = (currentTurn: Seat): GameState => ({
    ...state,
    board,
    turn: currentTurn,
    aliveSeats,
    phase: 'playing',
    winner: null,
    captures,
    moveCount: state.moveCount + 1,
    lastMove: move,
    events,
  })

  let skippedCount = 0
  while (!hasAnyLegalMove(partialState(turn), turn)) {
    events.push({ type: 'skip', seat: turn })
    skippedCount += 1
    if (skippedCount >= aliveSeats.length) {
      // Every alive seat was skipped in one full pass: nobody can move.
      phase = 'draw'
      winner = null
      events.push({ type: 'draw' })
      break
    }
    turn = nextSeat(turn, aliveSeats)
  }

  return {
    ...state,
    board,
    turn,
    aliveSeats,
    phase,
    winner,
    captures,
    moveCount: state.moveCount + 1,
    lastMove: move,
    events,
  }
}
