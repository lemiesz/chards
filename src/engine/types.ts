/**
 * Core types for the Chards engine.
 *
 * ARCHITECTURE RULE: nothing in `src/engine/` may import React, the DOM, or any
 * browser API. This module is pure TypeScript so the rules are unit-testable and
 * can later run unchanged on a server for online multiplayer.
 *
 * Coordinates are (row, col) with row 0 = North edge and col 0 = West edge.
 */

// Type-only import: `DeckCount` conceptually belongs with deck-building, but
// `GameState` needs to carry it. This is erased at compile time so it does
// not create a runtime circular dependency with `./deck` (which imports
// value-level `Card`/`Seat` from this module).
import type { DeckCount } from './deck'

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** Clubs, Diamonds, Hearts, Spades. Reset ordering tie-break is C < D < H < S. */
export type Suit = 'C' | 'D' | 'H' | 'S'

export type Rank =
  'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface Card {
  readonly rank: Rank
  readonly suit: Suit
}

export const SUITS: readonly Suit[] = ['C', 'D', 'H', 'S']

export const RANKS: readonly Rank[] = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
]

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king'

/** Seats are named for the board edge the player sits at. */
export type Seat = 'S' | 'W' | 'N' | 'E'

/** Clockwise turn order viewed from above. */
export const SEAT_ORDER: readonly Seat[] = ['S', 'W', 'N', 'E']

export const SEAT_NAMES: Readonly<Record<Seat, string>> = {
  S: 'South',
  W: 'West',
  N: 'North',
  E: 'East',
}

/**
 * Each player IS a suit and deals from their own personal deck (PLAN.md
 * §1.2): South/Spades, West/Hearts, North/Clubs, East/Diamonds.
 *
 * NOTE the unfortunate collision: seat `'S'` means South, but suit `'S'`
 * means Spades. They are different types (`Seat` vs `Suit`) that happen to
 * share a letter only for South/Spades. Always go through `SEAT_SUITS`
 * rather than assuming a seat's letter is its suit.
 */
export const SEAT_SUITS: Readonly<Record<Seat, Suit>> = {
  S: 'S', // South deals Spades
  W: 'H', // West deals Hearts
  N: 'C', // North deals Clubs
  E: 'D', // East deals Diamonds
}

export interface Piece {
  /** Stable unique id, e.g. "S-0". Never reused within a game. */
  readonly id: string
  readonly owner: Seat
  readonly card: Card
  /**
   * Current movement type. Equals `pieceTypeFor(card.rank)` unless the piece is
   * a promoted pawn, in which case it is 'queen'.
   */
  readonly pieceType: PieceType
  /** True once a pawn has promoted. Survives board resets. */
  readonly promoted: boolean
  /**
   * Index (0-5) of this piece's card in the order its owner originally drew
   * their hand. `{rank, suit}` is NOT a unique key once a game uses 2 decks
   * (a seat's own suit can repeat), so this is the explicit, deterministic
   * field board-reset ordering ties break on (PLAN.md §1.6) instead of
   * suit — every one of a seat's cards is that seat's own suit, so suit can
   * never distinguish them anyway. Survives promotion and resets unchanged.
   */
  readonly drawIndex: number
}

// ---------------------------------------------------------------------------
// Board & moves
// ---------------------------------------------------------------------------

export const BOARD_SIZE = 8

export interface Square {
  readonly row: number
  readonly col: number
}

/** 8x8, indexed [row][col]. `null` means empty. */
export type Board = readonly (readonly (Piece | null)[])[]

export interface Move {
  readonly from: Square
  readonly to: Square
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export type GamePhase = 'playing' | 'finished' | 'draw'

export interface CaptureRecord {
  /** The captured piece, as it was at time of capture. */
  readonly piece: Piece
  /** Seat that made the capture. */
  readonly by: Seat
  /** Value of `moveCount` when the capture happened. */
  readonly moveNumber: number
}

/**
 * Events emitted by the most recent `applyMove` call, in order. The UI uses
 * these for banners/toasts; the engine never needs to read them back.
 */
export type GameEvent =
  | { readonly type: 'move'; readonly seat: Seat; readonly move: Move }
  | { readonly type: 'capture'; readonly by: Seat; readonly piece: Piece }
  | { readonly type: 'promotion'; readonly seat: Seat; readonly at: Square }
  | { readonly type: 'elimination'; readonly seat: Seat }
  | { readonly type: 'reset' }
  | { readonly type: 'skip'; readonly seat: Seat }
  | { readonly type: 'win'; readonly seat: Seat }
  | { readonly type: 'draw' }

export interface GameState {
  readonly board: Board
  /** Seat to move. Meaningless once `phase !== 'playing'`. */
  readonly turn: Seat
  /** Seats that still have at least one piece, in clockwise S,W,N,E order. */
  readonly aliveSeats: readonly Seat[]
  readonly phase: GamePhase
  readonly winner: Seat | null
  readonly captures: readonly CaptureRecord[]
  /** Number of moves applied so far. */
  readonly moveCount: number
  readonly lastMove: Move | null
  /** Events produced by the move that created this state. */
  readonly events: readonly GameEvent[]
  /** The six cards each seat was dealt, in draw order. Kept for UI display. */
  readonly hands: Readonly<Record<Seat, readonly Card[]>>
  /** Seed used to deal this game, when one was supplied. */
  readonly seed: number | null
  /** How many standard decks were combined into each seat's personal deck (PLAN.md §1.2). */
  readonly deckCount: DeckCount
}

// ---------------------------------------------------------------------------
// Geometry: back-row setup slots (see PLAN.md §1.1)
// ---------------------------------------------------------------------------

/**
 * Setup slots 1..6 for each seat, in "left to right" order from that seat's
 * point of view. Index 0 of each array is slot 1. Board corners are never used.
 */
export const SETUP_SLOTS: Readonly<Record<Seat, readonly Square[]>> = {
  S: [1, 2, 3, 4, 5, 6].map((col) => ({ row: 7, col })),
  W: [1, 2, 3, 4, 5, 6].map((row) => ({ row, col: 0 })),
  N: [6, 5, 4, 3, 2, 1].map((col) => ({ row: 0, col })),
  E: [6, 5, 4, 3, 2, 1].map((row) => ({ row, col: 7 })),
}

/**
 * Unit vector a seat's pawns advance along: directly away from their home edge.
 */
export const PAWN_DIRECTION: Readonly<
  Record<Seat, { readonly dRow: number; readonly dCol: number }>
> = {
  S: { dRow: -1, dCol: 0 },
  W: { dRow: 0, dCol: 1 },
  N: { dRow: 1, dCol: 0 },
  E: { dRow: 0, dCol: -1 },
}

/** The row/col index a seat's pawn must reach to promote (the far edge). */
export const PROMOTION_EDGE: Readonly<
  Record<Seat, { readonly axis: 'row' | 'col'; readonly index: number }>
> = {
  S: { axis: 'row', index: 0 },
  W: { axis: 'col', index: 7 },
  N: { axis: 'row', index: 7 },
  E: { axis: 'col', index: 0 },
}

// ---------------------------------------------------------------------------
// Card helpers (PLAN.md §1.3)
// ---------------------------------------------------------------------------

/** Point value used for first-player calculation and reset ordering. */
export function pointValue(card: Card): number {
  switch (card.rank) {
    case 'A':
      return 1
    case '10':
      return 10
    case 'J':
      return 11
    case 'Q':
      return 12
    case 'K':
      return 13
    default:
      return Number(card.rank)
  }
}

/** The piece a card maps to at setup. */
export function pieceTypeFor(rank: Rank): PieceType {
  switch (rank) {
    case 'A':
      return 'bishop'
    case '10':
      return 'rook'
    case 'J':
      return 'knight'
    case 'Q':
      return 'queen'
    case 'K':
      return 'king'
    default:
      return 'pawn'
  }
}

// ---------------------------------------------------------------------------
// Small shared utilities
// ---------------------------------------------------------------------------

export function inBounds(sq: Square): boolean {
  return (
    sq.row >= 0 && sq.row < BOARD_SIZE && sq.col >= 0 && sq.col < BOARD_SIZE
  )
}

export function sameSquare(a: Square, b: Square): boolean {
  return a.row === b.row && a.col === b.col
}

export function pieceAt(board: Board, sq: Square): Piece | null {
  if (!inBounds(sq)) return null
  return board[sq.row][sq.col]
}

/**
 * A `rank+suit` string for a card, e.g. "2C". Handy as a display/grouping
 * key, but with 2-deck games in play `{rank, suit}` is NO LONGER a unique
 * identifier for a card or a piece — a seat can hold the same card twice
 * (PLAN.md §1.2). Do not use `cardKey` (or any `{rank, suit}` comparison) as
 * a uniqueness key for pieces; use `Piece.id` instead, which is always
 * unique within a game.
 */
export function cardKey(card: Card): string {
  return `${card.rank}${card.suit}`
}
