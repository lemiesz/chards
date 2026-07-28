/**
 * Move generation for the Chards engine.
 *
 * Chards has NO check / checkmate / castling logic of any kind. The king is
 * an ordinary piece that moves one square in any direction, may be captured,
 * and may be moved onto a square attacked by another player.
 *
 * `legalMoves` generates moves for whatever piece occupies `from`,
 * regardless of whose turn it currently is. Turn-ownership validation (i.e.
 * "is it this seat's turn to move this piece") is the responsibility of
 * `applyMove` in `apply.ts`, not this module.
 */

import {
  BOARD_SIZE,
  PAWN_DIRECTION,
  inBounds,
  pieceAt,
  type Board,
  type GameState,
  type Move,
  type Piece,
  type Seat,
  type Square,
} from './types'

const BISHOP_DIRS: readonly Square[] = [
  { row: -1, col: -1 },
  { row: -1, col: 1 },
  { row: 1, col: -1 },
  { row: 1, col: 1 },
]

const ROOK_DIRS: readonly Square[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
]

const QUEEN_KING_DIRS: readonly Square[] = [...BISHOP_DIRS, ...ROOK_DIRS]

const KNIGHT_OFFSETS: readonly Square[] = [
  { row: -2, col: -1 },
  { row: -2, col: 1 },
  { row: -1, col: -2 },
  { row: -1, col: 2 },
  { row: 1, col: -2 },
  { row: 1, col: 2 },
  { row: 2, col: -1 },
  { row: 2, col: 1 },
]

function slideMoves(
  board: Board,
  from: Square,
  owner: Seat,
  dirs: readonly Square[],
): Square[] {
  const moves: Square[] = []
  for (const dir of dirs) {
    let row = from.row + dir.row
    let col = from.col + dir.col
    while (inBounds({ row, col })) {
      const occupant = board[row][col]
      if (occupant === null) {
        moves.push({ row, col })
      } else {
        if (occupant.owner !== owner) {
          moves.push({ row, col })
        }
        break
      }
      row += dir.row
      col += dir.col
    }
  }
  return moves
}

function stepMoves(
  board: Board,
  from: Square,
  owner: Seat,
  offsets: readonly Square[],
): Square[] {
  const moves: Square[] = []
  for (const offset of offsets) {
    const to: Square = {
      row: from.row + offset.row,
      col: from.col + offset.col,
    }
    if (!inBounds(to)) continue
    const occupant = board[to.row][to.col]
    if (occupant === null || occupant.owner !== owner) {
      moves.push(to)
    }
  }
  return moves
}

function pawnMoves(board: Board, from: Square, piece: Piece): Square[] {
  const moves: Square[] = []
  const { dRow, dCol } = PAWN_DIRECTION[piece.owner]

  // Straight advance: only onto an empty square, only one square.
  const forward: Square = { row: from.row + dRow, col: from.col + dCol }
  if (inBounds(forward) && board[forward.row][forward.col] === null) {
    moves.push(forward)
  }

  // Diagonal captures: the two squares forward-plus-sideways.
  const sideways: Square[] =
    dRow === 0
      ? [
          { row: from.row - 1, col: from.col + dCol },
          { row: from.row + 1, col: from.col + dCol },
        ]
      : [
          { row: from.row + dRow, col: from.col - 1 },
          { row: from.row + dRow, col: from.col + 1 },
        ]

  for (const to of sideways) {
    if (!inBounds(to)) continue
    const occupant = board[to.row][to.col]
    if (occupant !== null && occupant.owner !== piece.owner) {
      moves.push(to)
    }
  }

  return moves
}

/**
 * All squares the piece on `from` may legally move to. Returns `[]` if
 * `from` is empty or off the board. Does NOT check whose turn it is — that
 * is `applyMove`'s job.
 */
export function legalMoves(state: GameState, from: Square): Square[] {
  const piece = pieceAt(state.board, from)
  if (piece === null) return []

  switch (piece.pieceType) {
    case 'bishop':
      return slideMoves(state.board, from, piece.owner, BISHOP_DIRS)
    case 'rook':
      return slideMoves(state.board, from, piece.owner, ROOK_DIRS)
    case 'queen':
      return slideMoves(state.board, from, piece.owner, QUEEN_KING_DIRS)
    case 'knight':
      return stepMoves(state.board, from, piece.owner, KNIGHT_OFFSETS)
    case 'king':
      return stepMoves(state.board, from, piece.owner, QUEEN_KING_DIRS)
    case 'pawn':
      return pawnMoves(state.board, from, piece)
    default:
      return []
  }
}

/** Every legal move available to every piece owned by `seat`. */
export function allLegalMoves(state: GameState, seat: Seat): Move[] {
  const moves: Move[] = []
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = state.board[row][col]
      if (piece === null || piece.owner !== seat) continue
      const from: Square = { row, col }
      for (const to of legalMoves(state, from)) {
        moves.push({ from, to })
      }
    }
  }
  return moves
}

/** Cheap early-exit check: does `seat` have at least one legal move? */
export function hasAnyLegalMove(state: GameState, seat: Seat): boolean {
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = state.board[row][col]
      if (piece === null || piece.owner !== seat) continue
      if (legalMoves(state, { row, col }).length > 0) return true
    }
  }
  return false
}

/** Convenience wrapper: is `move` among the legal moves for the piece at its `from` square? */
export function isLegalMove(state: GameState, move: Move): boolean {
  return legalMoves(state, move.from).some(
    (to) => to.row === move.to.row && to.col === move.to.col,
  )
}
