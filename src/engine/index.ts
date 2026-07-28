/**
 * Public API surface of the Chards engine. UI code should import from here
 * rather than reaching into individual engine modules.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  Suit,
  Rank,
  Card,
  PieceType,
  Seat,
  Piece,
  Square,
  Board,
  Move,
  GamePhase,
  CaptureRecord,
  GameEvent,
  GameState,
} from './types'

export {
  SUITS,
  RANKS,
  SUIT_ORDER,
  SEAT_ORDER,
  SEAT_NAMES,
  BOARD_SIZE,
  SETUP_SLOTS,
  PAWN_DIRECTION,
  PROMOTION_EDGE,
  pointValue,
  pieceTypeFor,
  inBounds,
  sameSquare,
  pieceAt,
  cardKey,
} from './types'

// ---------------------------------------------------------------------------
// Deck
// ---------------------------------------------------------------------------

export type { Rng } from './deck'
export { makeRng, buildDeck, shuffle, deal } from './deck'

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export { placeHands, handSum, firstSeat, nextSeat, newGame } from './setup'

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

export {
  legalMoves,
  allLegalMoves,
  hasAnyLegalMove,
  isLegalMove,
} from './moves'

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export {
  applyMove,
  canApply,
  pieceCounts,
  findSeatPieces,
  resetBoard,
} from './apply'

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export { SAVE_VERSION, serialize, deserialize } from './serialize'

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export * from './ai'
