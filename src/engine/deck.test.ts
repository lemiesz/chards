import { describe, it, expect } from 'vitest'
import {
  buildDeck,
  buildSuitDeck,
  shuffle,
  makeRng,
  deal,
  DECK_COUNTS,
  type DeckCount,
} from './deck'
import { cardKey, RANKS, SEAT_SUITS, SEAT_ORDER } from './types'

describe('buildDeck', () => {
  it('has 52 distinct cards', () => {
    const deck = buildDeck()
    expect(deck).toHaveLength(52)
    const keys = new Set(deck.map(cardKey))
    expect(keys.size).toBe(52)
  })

  it('is ordered deterministically suit-major', () => {
    const a = buildDeck()
    const b = buildDeck()
    expect(a).toEqual(b)
    expect(a[0]).toEqual({ rank: 'A', suit: 'C' })
    expect(a[12]).toEqual({ rank: 'K', suit: 'C' })
    expect(a[13]).toEqual({ rank: 'A', suit: 'D' })
  })
})

describe('makeRng', () => {
  it('produces numbers in [0, 1)', () => {
    const rng = makeRng(42)
    for (let i = 0; i < 100; i++) {
      const n = rng()
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(1)
    }
  })

  it('same seed produces the same sequence', () => {
    const a = makeRng(123)
    const b = makeRng(123)
    const seqA = Array.from({ length: 20 }, () => a())
    const seqB = Array.from({ length: 20 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('different seeds produce different sequences', () => {
    const a = makeRng(1)
    const b = makeRng(2)
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).not.toEqual(seqB)
  })
})

describe('shuffle', () => {
  it('does not mutate the input array', () => {
    const items = [1, 2, 3, 4, 5]
    const copy = [...items]
    shuffle(items, makeRng(1))
    expect(items).toEqual(copy)
  })

  it('returns a permutation of the input', () => {
    const items = buildDeck()
    const shuffled = shuffle(items, makeRng(7))
    expect(shuffled).toHaveLength(items.length)
    expect(new Set(shuffled.map(cardKey))).toEqual(new Set(items.map(cardKey)))
  })

  it('same seed produces the same shuffle', () => {
    const items = buildDeck()
    const a = shuffle(items, makeRng(99))
    const b = shuffle(items, makeRng(99))
    expect(a).toEqual(b)
  })

  it('different seeds produce different shuffles', () => {
    const items = buildDeck()
    const a = shuffle(items, makeRng(1))
    const b = shuffle(items, makeRng(2))
    expect(a).not.toEqual(b)
  })
})

describe('buildSuitDeck', () => {
  it('has 13 cards, all of the given suit, for 1 deck', () => {
    const deck = buildSuitDeck('C', 1)
    expect(deck).toHaveLength(13)
    expect(deck.every((c) => c.suit === 'C')).toBe(true)
    expect(new Set(deck.map(cardKey)).size).toBe(13)
  })

  it('has 26 cards, two of each rank, for 2 decks', () => {
    const deck = buildSuitDeck('H', 2)
    expect(deck).toHaveLength(26)
    expect(deck.every((c) => c.suit === 'H')).toBe(true)
    const counts = new Map<string, number>()
    for (const card of deck) {
      counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1)
    }
    expect(counts.size).toBe(13)
    for (const count of counts.values()) expect(count).toBe(2)
  })
})

describe('DECK_COUNTS', () => {
  it('is [1, 2]', () => {
    expect(DECK_COUNTS).toEqual([1, 2])
  })
})

describe('deal', () => {
  it.each(DECK_COUNTS)(
    "gives each seat 6 cards containing ONLY that seat's own suit (deckCount=%i)",
    (deckCount: DeckCount) => {
      const hands = deal(makeRng(5), deckCount)
      for (const seat of SEAT_ORDER) {
        expect(hands[seat]).toHaveLength(6)
        expect(hands[seat].every((c) => c.suit === SEAT_SUITS[seat])).toBe(
          true,
        )
      }
    },
  )

  it('with 1 deck, a seat is always dealt 6 distinct ranks (no duplicates possible)', () => {
    for (let seed = 0; seed < 300; seed++) {
      const hands = deal(makeRng(seed), 1)
      for (const seat of SEAT_ORDER) {
        const ranks = hands[seat].map((c) => c.rank)
        expect(new Set(ranks).size).toBe(ranks.length)
      }
    }
  })

  it('with 2 decks, a seat can be dealt the same rank twice, and it deals correctly', () => {
    for (let seed = 0; seed < 500; seed++) {
      const hands = deal(makeRng(seed), 2)
      for (const seat of SEAT_ORDER) {
        const hand = hands[seat]
        const ranks = hand.map((c) => c.rank)
        const dupeRank = ranks.find((r, i) => ranks.indexOf(r) !== i)
        if (dupeRank === undefined) continue

        // Found a duplicate: assert it deals correctly -- the hand is still
        // 6 cards, the duplicates are both the seat's own suit, and both
        // copies are otherwise identical cards (as expected from a 2-deck
        // personal deck, PLAN.md §1.2).
        expect(hand).toHaveLength(6)
        const dupes = hand.filter((c) => c.rank === dupeRank)
        expect(dupes.length).toBeGreaterThanOrEqual(2)
        for (const card of dupes) expect(card.suit).toBe(SEAT_SUITS[seat])
        return
      }
    }
    throw new Error('expected at least one duplicate rank within 500 seeds')
  })

  it('it is possible for all four seats to hold the same rank simultaneously', () => {
    let allFour = false
    for (let seed = 0; seed < 500 && !allFour; seed++) {
      const hands = deal(makeRng(seed), 1)
      const rankSets = SEAT_ORDER.map(
        (seat) => new Set(hands[seat].map((c) => c.rank)),
      )
      allFour = RANKS.some((rank) => rankSets.every((set) => set.has(rank)))
    }
    expect(allFour).toBe(true)
  })

  it('same seed + same deckCount deals the same hands', () => {
    const a = deal(makeRng(11), 1)
    const b = deal(makeRng(11), 1)
    expect(a).toEqual(b)
  })

  it('different seeds deal different hands', () => {
    const a = deal(makeRng(11), 1)
    const b = deal(makeRng(12), 1)
    expect(a).not.toEqual(b)
  })

  it('same seed but different deckCount deals a different hand', () => {
    const a = deal(makeRng(11), 1)
    const b = deal(makeRng(11), 2)
    expect(a).not.toEqual(b)
  })
})
