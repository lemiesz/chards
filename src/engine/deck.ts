/**
 * Deck construction, shuffling, and dealing (PLAN.md §1.2).
 *
 * Pure TypeScript, no DOM/React imports (see engine/types.ts architecture rule).
 */

import { RANKS, SUITS, type Card, type Seat } from './types'

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
 * Shuffles a fresh 52-card deck and deals 6 cards to each seat.
 *
 * Deal order: one round-robin pass in S, W, N, E order, drawing from the top
 * of the shuffled deck, repeated 6 times (i.e. deck[0]->S, deck[1]->W,
 * deck[2]->N, deck[3]->E, deck[4]->S, ...). Each seat's hand is in draw
 * order. 24 cards are dealt; the remaining 28 are unused.
 */
export function deal(rng: Rng): Record<Seat, Card[]> {
  const deck = shuffle(buildDeck(), rng)
  const seats: readonly Seat[] = ['S', 'W', 'N', 'E']
  const hands: Record<Seat, Card[]> = { S: [], W: [], N: [], E: [] }
  for (let i = 0; i < 24; i++) {
    const seat = seats[i % 4]
    hands[seat].push(deck[i])
  }
  return hands
}
