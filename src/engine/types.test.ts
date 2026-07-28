import { describe, it, expect } from 'vitest'
import {
  pointValue,
  pieceTypeFor,
  SETUP_SLOTS,
  SEAT_ORDER,
  RANKS,
  SUITS,
  inBounds,
  sameSquare,
  type Rank,
} from './types'

describe('pointValue', () => {
  it('maps aces to 1 and faces to 11/12/13', () => {
    expect(pointValue({ rank: 'A', suit: 'C' })).toBe(1)
    expect(pointValue({ rank: 'J', suit: 'D' })).toBe(11)
    expect(pointValue({ rank: 'Q', suit: 'H' })).toBe(12)
    expect(pointValue({ rank: 'K', suit: 'S' })).toBe(13)
    expect(pointValue({ rank: '10', suit: 'S' })).toBe(10)
  })

  it('maps 2-9 to face value', () => {
    for (const rank of ['2', '3', '4', '5', '6', '7', '8', '9'] as Rank[]) {
      expect(pointValue({ rank, suit: 'C' })).toBe(Number(rank))
    }
  })

  it('covers every rank with a positive value', () => {
    for (const rank of RANKS) {
      expect(pointValue({ rank, suit: 'C' })).toBeGreaterThan(0)
    }
  })
})

describe('pieceTypeFor', () => {
  it('maps per the card->piece table', () => {
    expect(pieceTypeFor('A')).toBe('bishop')
    expect(pieceTypeFor('K')).toBe('king')
    expect(pieceTypeFor('Q')).toBe('queen')
    expect(pieceTypeFor('J')).toBe('knight')
    expect(pieceTypeFor('10')).toBe('rook')
    for (const rank of ['2', '3', '4', '5', '6', '7', '8', '9'] as Rank[]) {
      expect(pieceTypeFor(rank)).toBe('pawn')
    }
  })
})

describe('board geometry', () => {
  it('has 13 ranks and 4 suits', () => {
    expect(RANKS).toHaveLength(13)
    expect(SUITS).toHaveLength(4)
  })

  it('orders seats clockwise', () => {
    expect(SEAT_ORDER).toEqual(['S', 'W', 'N', 'E'])
  })

  it('places six setup slots per seat, never on a corner', () => {
    const corners = [
      { row: 0, col: 0 },
      { row: 0, col: 7 },
      { row: 7, col: 0 },
      { row: 7, col: 7 },
    ]
    for (const seat of SEAT_ORDER) {
      const slots = SETUP_SLOTS[seat]
      expect(slots).toHaveLength(6)
      for (const sq of slots) {
        expect(inBounds(sq)).toBe(true)
        expect(corners.some((c) => sameSquare(c, sq))).toBe(false)
      }
    }
  })

  it('matches the slot table in PLAN.md §1.1', () => {
    expect(SETUP_SLOTS.S.map((s) => s.col)).toEqual([1, 2, 3, 4, 5, 6])
    expect(SETUP_SLOTS.S.every((s) => s.row === 7)).toBe(true)
    expect(SETUP_SLOTS.W.map((s) => s.row)).toEqual([1, 2, 3, 4, 5, 6])
    expect(SETUP_SLOTS.W.every((s) => s.col === 0)).toBe(true)
    expect(SETUP_SLOTS.N.map((s) => s.col)).toEqual([6, 5, 4, 3, 2, 1])
    expect(SETUP_SLOTS.N.every((s) => s.row === 0)).toBe(true)
    expect(SETUP_SLOTS.E.map((s) => s.row)).toEqual([6, 5, 4, 3, 2, 1])
    expect(SETUP_SLOTS.E.every((s) => s.col === 7)).toBe(true)
  })
})
