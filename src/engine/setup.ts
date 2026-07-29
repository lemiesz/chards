/**
 * Initial board placement and first-player determination (PLAN.md §1.1, §1.4).
 *
 * Pure TypeScript, no DOM/React imports (see engine/types.ts architecture rule).
 */

import { deal, makeRng, type DeckCount, type Rng } from './deck'
import {
  BOARD_SIZE,
  SEAT_ORDER,
  SETUP_SLOTS,
  pieceTypeFor,
  pointValue,
  type Board,
  type Card,
  type GameState,
  type Piece,
  type Seat,
} from './types'

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/** Builds the 8x8 board, placing each seat's dealt hand into its setup slots. */
export function placeHands(hands: Record<Seat, readonly Card[]>): Board {
  const board: (Piece | null)[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null),
  )

  for (const seat of SEAT_ORDER) {
    const hand = hands[seat]
    const slots = SETUP_SLOTS[seat]
    for (let i = 0; i < hand.length && i < slots.length; i++) {
      const card = hand[i]
      const slot = slots[i]
      const piece: Piece = {
        id: `${seat}-${i}`,
        owner: seat,
        card,
        pieceType: pieceTypeFor(card.rank),
        promoted: false,
        drawIndex: i,
      }
      board[slot.row][slot.col] = piece
    }
  }

  return board
}

// ---------------------------------------------------------------------------
// First player (PLAN.md §1.4)
// ---------------------------------------------------------------------------

/** Sum of pointValue across a hand. */
export function handSum(hand: readonly Card[]): number {
  return hand.reduce((sum, card) => sum + pointValue(card), 0)
}

/**
 * Determines who goes first: lowest hand sum. Ties are broken by comparing
 * the tied seats' card values sorted ascending, element by element (lowest
 * card first). If the value multisets are identical, a seat is picked
 * randomly (deterministically, via `rng`) among the still-tied seats.
 */
export function firstSeat(
  hands: Record<Seat, readonly Card[]>,
  rng: Rng,
): Seat {
  let contenders: Seat[] = [...SEAT_ORDER]
  let lowestSum = Infinity
  for (const seat of SEAT_ORDER) {
    const sum = handSum(hands[seat])
    if (sum < lowestSum) {
      lowestSum = sum
      contenders = [seat]
    } else if (sum === lowestSum) {
      contenders.push(seat)
    }
  }

  if (contenders.length === 1) return contenders[0]

  // Tie-break: compare sorted-ascending card values element by element.
  const sortedValues: Record<Seat, number[]> = { S: [], W: [], N: [], E: [] }
  for (const seat of contenders) {
    sortedValues[seat] = hands[seat]
      .map((card) => pointValue(card))
      .slice()
      .sort((a, b) => a - b)
  }

  let stillTied = contenders
  const cardCount = Math.max(
    ...contenders.map((seat) => sortedValues[seat].length),
  )
  for (let i = 0; i < cardCount && stillTied.length > 1; i++) {
    let lowestCard = Infinity
    let next: Seat[] = []
    for (const seat of stillTied) {
      const value = sortedValues[seat][i]
      if (value < lowestCard) {
        lowestCard = value
        next = [seat]
      } else if (value === lowestCard) {
        next.push(seat)
      }
    }
    stillTied = next
  }

  if (stillTied.length === 1) return stillTied[0]

  // Identical value multisets: pick randomly among the still-tied seats.
  const index = Math.floor(rng() * stillTied.length)
  return stillTied[Math.min(index, stillTied.length - 1)]
}

// ---------------------------------------------------------------------------
// Turn order
// ---------------------------------------------------------------------------

/**
 * The next alive seat clockwise in SEAT_ORDER (S -> W -> N -> E -> S), after
 * `current`. If `current` is no longer alive, still returns the next alive
 * seat clockwise from its position. Throws if `aliveSeats` is empty.
 */
export function nextSeat(current: Seat, aliveSeats: readonly Seat[]): Seat {
  if (aliveSeats.length === 0) {
    throw new Error('nextSeat: aliveSeats is empty')
  }
  const alive = new Set(aliveSeats)
  const startIndex = SEAT_ORDER.indexOf(current)
  for (let step = 1; step <= SEAT_ORDER.length; step++) {
    const seat = SEAT_ORDER[(startIndex + step) % SEAT_ORDER.length]
    if (alive.has(seat)) return seat
  }
  // Unreachable given the aliveSeats.length === 0 guard above, but keeps TS
  // satisfied that a Seat is always returned.
  throw new Error('nextSeat: no alive seat found')
}

// ---------------------------------------------------------------------------
// New game
// ---------------------------------------------------------------------------

export function newGame(options?: {
  seed?: number
  rng?: Rng
  deckCount?: DeckCount
}): GameState {
  const seed = options?.seed
  const rng =
    options?.rng ?? (seed !== undefined ? makeRng(seed) : makeRng(Date.now()))
  const deckCount = options?.deckCount ?? 1

  const hands = deal(rng, deckCount)
  const board = placeHands(hands)
  const turn = firstSeat(hands, rng)

  return {
    board,
    turn,
    aliveSeats: [...SEAT_ORDER],
    phase: 'playing',
    winner: null,
    captures: [],
    moveCount: 0,
    lastMove: null,
    events: [],
    hands,
    seed: seed ?? null,
    deckCount,
  }
}
