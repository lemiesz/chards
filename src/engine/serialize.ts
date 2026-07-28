/**
 * Save-game serialization (PLAN.md §1.6 / T1.6).
 *
 * Pure TypeScript, no DOM/React imports (see engine/types.ts architecture rule).
 */

import {
  BOARD_SIZE,
  RANKS,
  SEAT_ORDER,
  SUITS,
  type Board,
  type Card,
  type CaptureRecord,
  type GameEvent,
  type GamePhase,
  type GameState,
  type Move,
  type Piece,
  type PieceType,
  type Rank,
  type Seat,
  type Square,
  type Suit,
} from './types'

export const SAVE_VERSION = 1

interface SaveFile {
  readonly version: number
  readonly state: GameState
}

/** Serializes `state` into a versioned JSON string. */
export function serialize(state: GameState): string {
  const saveFile: SaveFile = { version: SAVE_VERSION, state }
  return JSON.stringify(saveFile)
}

/**
 * Parses a JSON string produced by `serialize`. Never throws: returns `null`
 * for malformed JSON, a missing/mismatched version, or a structurally
 * invalid state.
 */
export function deserialize(json: string): GameState | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }

  if (!isRecord(parsed)) return null
  if (parsed.version !== SAVE_VERSION) return null
  if (!isGameState(parsed.state)) return null

  return parsed.state
}

// ---------------------------------------------------------------------------
// Structural validation
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const SEAT_SET: ReadonlySet<string> = new Set(SEAT_ORDER)
const SUIT_SET: ReadonlySet<string> = new Set(SUITS)
const RANK_SET: ReadonlySet<string> = new Set(RANKS)
const PHASE_SET: ReadonlySet<string> = new Set(['playing', 'finished', 'draw'])
const PIECE_TYPE_SET: ReadonlySet<string> = new Set([
  'pawn',
  'knight',
  'bishop',
  'rook',
  'queen',
  'king',
])

function isSeat(value: unknown): value is Seat {
  return typeof value === 'string' && SEAT_SET.has(value)
}

function isSuit(value: unknown): value is Suit {
  return typeof value === 'string' && SUIT_SET.has(value)
}

function isRank(value: unknown): value is Rank {
  return typeof value === 'string' && RANK_SET.has(value)
}

function isGamePhase(value: unknown): value is GamePhase {
  return typeof value === 'string' && PHASE_SET.has(value)
}

function isPieceType(value: unknown): value is PieceType {
  return typeof value === 'string' && PIECE_TYPE_SET.has(value)
}

function isCard(value: unknown): value is Card {
  return isRecord(value) && isRank(value.rank) && isSuit(value.suit)
}

function isSquare(value: unknown): value is Square {
  return (
    isRecord(value) &&
    typeof value.row === 'number' &&
    typeof value.col === 'number' &&
    Number.isInteger(value.row) &&
    Number.isInteger(value.col) &&
    value.row >= 0 &&
    value.row < BOARD_SIZE &&
    value.col >= 0 &&
    value.col < BOARD_SIZE
  )
}

function isPiece(value: unknown): value is Piece {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isSeat(value.owner) &&
    isCard(value.card) &&
    isPieceType(value.pieceType) &&
    typeof value.promoted === 'boolean'
  )
}

function isBoard(value: unknown): value is Board {
  if (!Array.isArray(value) || value.length !== BOARD_SIZE) return false
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== BOARD_SIZE) return false
    for (const cell of row) {
      if (cell !== null && !isPiece(cell)) return false
    }
  }
  return true
}

function isMove(value: unknown): value is Move {
  return isRecord(value) && isSquare(value.from) && isSquare(value.to)
}

function isCaptureRecord(value: unknown): value is CaptureRecord {
  return (
    isRecord(value) &&
    isPiece(value.piece) &&
    isSeat(value.by) &&
    typeof value.moveNumber === 'number'
  )
}

function isGameEvent(value: unknown): value is GameEvent {
  if (!isRecord(value) || typeof value.type !== 'string') return false
  switch (value.type) {
    case 'move':
      return isSeat(value.seat) && isMove(value.move)
    case 'capture':
      return isSeat(value.by) && isPiece(value.piece)
    case 'promotion':
      return isSeat(value.seat) && isSquare(value.at)
    case 'elimination':
      return isSeat(value.seat)
    case 'reset':
      return true
    case 'skip':
      return isSeat(value.seat)
    case 'win':
      return isSeat(value.seat)
    case 'draw':
      return true
    default:
      return false
  }
}

function isHands(value: unknown): value is Record<Seat, readonly Card[]> {
  if (!isRecord(value)) return false
  for (const seat of SEAT_ORDER) {
    const hand = value[seat]
    if (!Array.isArray(hand) || !hand.every(isCard)) return false
  }
  return true
}

function isGameState(value: unknown): value is GameState {
  if (!isRecord(value)) return false

  if (!isBoard(value.board)) return false
  if (!isSeat(value.turn)) return false
  if (
    !Array.isArray(value.aliveSeats) ||
    !value.aliveSeats.every(isSeat) ||
    new Set(value.aliveSeats).size !== value.aliveSeats.length
  ) {
    return false
  }
  if (!isGamePhase(value.phase)) return false
  if (value.winner !== null && !isSeat(value.winner)) return false
  if (
    !Array.isArray(value.captures) ||
    !value.captures.every(isCaptureRecord)
  ) {
    return false
  }
  if (
    typeof value.moveCount !== 'number' ||
    !Number.isInteger(value.moveCount)
  ) {
    return false
  }
  if (value.lastMove !== null && !isMove(value.lastMove)) return false
  if (!Array.isArray(value.events) || !value.events.every(isGameEvent))
    return false
  if (!isHands(value.hands)) return false
  if (value.seed !== null && typeof value.seed !== 'number') return false

  return true
}
