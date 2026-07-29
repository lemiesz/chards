/**
 * Deck construction, shuffling, and dealing (PLAN.md §1.2).
 *
 * Pure TypeScript, no DOM/React imports (see engine/types.ts architecture rule).
 */

import {
  RANKS,
  SEAT_ORDER,
  SEAT_SUITS,
  SUITS,
  type Card,
  type Seat,
  type Suit,
} from './types'

// ---------------------------------------------------------------------------
// RNG
// ---------------------------------------------------------------------------

/** A source of numbers in [0, 1), like Math.random. */
export type Rng = () => number

/**
 * Deterministic PRNG (mulberry32). Same seed always produces the same
 * sequence, which is what makes seeded games reproducible.
 */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Deck
// ---------------------------------------------------------------------------

/** A standard 52-card deck, ordered deterministically suit-major (C, D, H, S; A..K within each suit). */
export function buildDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit })
    }
  }
  return deck
}

/** How many standard 52-card decks a game combines (PLAN.md §1.2). */
export type DeckCount = 1 | 2

export const DECK_COUNTS: readonly DeckCount[] = [1, 2]

/**
 * A player's personal deck: every card of `suit` across `deckCount` standard
 * decks (13 cards for 1 deck, 26 — two of each rank — for 2). Ordered
 * rank-major, then by deck copy, so `shuffle` sees a deterministic input.
 */
export function buildSuitDeck(suit: Suit, deckCount: DeckCount): Card[] {
  const deck: Card[] = []
  for (let copy = 0; copy < deckCount; copy++) {
    for (const rank of RANKS) {
      deck.push({ rank, suit })
    }
  }
  return deck
}

/** Pure Fisher-Yates shuffle. Returns a new array; never mutates `items`. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = items.slice()
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = result[i]
    result[i] = result[j]
    result[j] = tmp
  }
  return result
}

// ---------------------------------------------------------------------------
// Dealing
// ---------------------------------------------------------------------------

/**
 * Deals 6 cards to each seat FROM ITS OWN PERSONAL DECK (PLAN.md §1.2) —
 * there is no shared 52-card deck players draw from together. Each seat's
 * personal deck is every card of its suit (`SEAT_SUITS`) across `deckCount`
 * standard decks: 13 cards for 1 deck (six distinct ranks dealt), 26 for 2
 * decks (two of each rank, so a duplicate rank can be dealt).
 *
 * Every seat shuffles its own deck with the SAME shared `rng`, consumed in a
 * fixed, deterministic seat order (S, W, N, E) so a given seed always
 * produces the same overall deal. Each seat's hand is in the order it drew
 * its own cards, top of its own shuffled deck first.
 */
export function deal(rng: Rng, deckCount: DeckCount): Record<Seat, Card[]> {
  const hands: Record<Seat, Card[]> = { S: [], W: [], N: [], E: [] }
  for (const seat of SEAT_ORDER) {
    const suitDeck = buildSuitDeck(SEAT_SUITS[seat], deckCount)
    const shuffled = shuffle(suitDeck, rng)
    hands[seat] = shuffled.slice(0, 6)
  }
  return hands
}
