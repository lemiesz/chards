import { describe, it, expect } from 'vitest'
import { buildDeck, shuffle, makeRng, deal } from './deck'
import { cardKey, SEAT_ORDER } from './types'

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

describe('deal', () => {
  it('gives each seat 6 distinct cards, 24 distinct overall', () => {
    const hands = deal(makeRng(5))
    for (const seat of SEAT_ORDER) {
      expect(hands[seat]).toHaveLength(6)
      const keys = new Set(hands[seat].map(cardKey))
      expect(keys.size).toBe(6)
    }
    const allKeys = SEAT_ORDER.flatMap((seat) => hands[seat].map(cardKey))
    expect(new Set(allKeys).size).toBe(24)
  })

  it('same seed deals the same hands', () => {
    const a = deal(makeRng(11))
    const b = deal(makeRng(11))
    expect(a).toEqual(b)
  })

  it('different seeds deal different hands', () => {
    const a = deal(makeRng(11))
    const b = deal(makeRng(12))
    expect(a).not.toEqual(b)
  })
})
