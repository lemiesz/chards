import { describe, it, expect } from 'vitest'
import { placeHands, handSum, firstSeat, nextSeat, newGame } from './setup'
import { makeRng } from './deck'
import { SEAT_ORDER, type Card, type Seat } from './types'

/** Builds a 6-card hand from rank/suit shorthand, e.g. ['2C', '3D', ...]. */
function hand(cards: string[]): Card[] {
  return cards.map((c) => {
    const rank = c.slice(0, -1) as Card['rank']
    const suit = c.slice(-1) as Card['suit']
    return { rank, suit }
  })
}

const CORNERS = [
  { row: 0, col: 0 },
  { row: 0, col: 7 },
  { row: 7, col: 0 },
  { row: 7, col: 7 },
]

function sampleHands(): Record<Seat, Card[]> {
  return {
    S: hand(['2C', '3C', '4C', '5C', '6C', '7C']),
    W: hand(['2D', '3D', '4D', '5D', '6D', '7D']),
    N: hand(['2H', '3H', '4H', '5H', '6H', '7H']),
    E: hand(['2S', '3S', '4S', '5S', '6S', '7S']),
  }
}

describe('placeHands', () => {
  it('places South slots 1-6 into row 7, cols 1-6, in draw order', () => {
    const board = placeHands(sampleHands())
    for (let i = 0; i < 6; i++) {
      const piece = board[7][i + 1]
      expect(piece).not.toBeNull()
      expect(piece!.card).toEqual({ rank: String(i + 2), suit: 'C' })
      expect(piece!.owner).toBe('S')
    }
  })

  it('places West slots 1-6 into col 0, rows 1-6, in draw order', () => {
    const board = placeHands(sampleHands())
    for (let i = 0; i < 6; i++) {
      const piece = board[i + 1][0]
      expect(piece).not.toBeNull()
      expect(piece!.card).toEqual({ rank: String(i + 2), suit: 'D' })
      expect(piece!.owner).toBe('W')
    }
  })

  it('places North slots 1-6 into row 0, cols 6-1, in draw order', () => {
    const board = placeHands(sampleHands())
    const expectedCols = [6, 5, 4, 3, 2, 1]
    for (let i = 0; i < 6; i++) {
      const piece = board[0][expectedCols[i]]
      expect(piece).not.toBeNull()
      expect(piece!.card).toEqual({ rank: String(i + 2), suit: 'H' })
      expect(piece!.owner).toBe('N')
    }
  })

  it('places East slots 1-6 into col 7, rows 6-1, in draw order', () => {
    const board = placeHands(sampleHands())
    const expectedRows = [6, 5, 4, 3, 2, 1]
    for (let i = 0; i < 6; i++) {
      const piece = board[expectedRows[i]][7]
      expect(piece).not.toBeNull()
      expect(piece!.card).toEqual({ rank: String(i + 2), suit: 'S' })
      expect(piece!.owner).toBe('E')
    }
  })

  it('leaves the four corners empty', () => {
    const board = placeHands(sampleHands())
    for (const { row, col } of CORNERS) {
      expect(board[row][col]).toBeNull()
    }
  })

  it('places exactly 24 pieces total', () => {
    const board = placeHands(sampleHands())
    let count = 0
    for (const row of board) {
      for (const cell of row) {
        if (cell !== null) count++
      }
    }
    expect(count).toBe(24)
  })

  it('assigns stable unique ids and correct pieceType mapping', () => {
    const hands: Record<Seat, Card[]> = {
      S: hand(['AC', '2C', 'JC', 'QC', 'KC', '10C']),
      W: hand(['2D', '3D', '4D', '5D', '6D', '7D']),
      N: hand(['2H', '3H', '4H', '5H', '6H', '7H']),
      E: hand(['2S', '3S', '4S', '5S', '6S', '7S']),
    }
    const board = placeHands(hands)
    const ids = new Set<string>()
    for (const row of board) {
      for (const cell of row) {
        if (cell) {
          expect(ids.has(cell.id)).toBe(false)
          ids.add(cell.id)
          expect(cell.promoted).toBe(false)
        }
      }
    }
    // South's slots: AC bishop, 2C pawn, JC knight, QC queen, KC king, 10C rook
    expect(board[7][1]!.pieceType).toBe('bishop')
    expect(board[7][2]!.pieceType).toBe('pawn')
    expect(board[7][3]!.pieceType).toBe('knight')
    expect(board[7][4]!.pieceType).toBe('queen')
    expect(board[7][5]!.pieceType).toBe('king')
    expect(board[7][6]!.pieceType).toBe('rook')
  })
})

describe('handSum', () => {
  it('sums pointValue across the hand', () => {
    expect(handSum(hand(['AC', '2C', '3C']))).toBe(1 + 2 + 3)
    expect(handSum(hand(['KC', 'QC', 'JC', '10C']))).toBe(13 + 12 + 11 + 10)
  })

  it('sums to 0 for an empty hand', () => {
    expect(handSum([])).toBe(0)
  })
})

describe('firstSeat', () => {
  it('picks the seat with the clear lowest sum', () => {
    const hands: Record<Seat, Card[]> = {
      S: hand(['AC', 'AD', 'AH', 'AS', '2C', '2D']), // sum 8
      W: hand(['KC', 'KD', 'KH', 'KS', 'QC', 'QD']), // sum 76
      N: hand(['9C', '9D', '9H', '9S', '8C', '8D']), // sum 52
      E: hand(['7C', '7D', '7H', '7S', '6C', '6D']), // sum 40
    }
    expect(firstSeat(hands, makeRng(1))).toBe('S')
  })

  it('breaks a sum tie by comparing lowest card first', () => {
    // S and W both sum to 20, but S's lowest card (2) beats W's lowest (3).
    const hands: Record<Seat, Card[]> = {
      S: hand(['2C', '3C', '3D', '4C', '4D', '4H']), // sorted: 2,3,3,4,4,4 = 20
      W: hand(['3S', '3H', '3D', '3C', '4S', '4H']), // sorted: 3,3,3,3,4,4 = 20
      N: hand(['10C', '10D', '10H', '10S', '9C', '9D']), // sum 58
      E: hand(['10C', '10D', '10H', '10S', '9H', '9S']), // sum 58
    }

    expect(handSum(hands.S)).toBe(20)
    expect(handSum(hands.W)).toBe(20)
    expect(firstSeat(hands, makeRng(1))).toBe('S')
  })

  it('picks randomly (deterministically) among an identical-multiset tie', () => {
    const hands: Record<Seat, Card[]> = {
      S: hand(['2C', '3C', '4C', '5C', '6C', '7C']),
      W: hand(['2D', '3D', '4D', '5D', '6D', '7D']), // identical values to S
      N: hand(['10C', '10D', '10H', '10S', '9C', '9D']), // sum 58, not tied
      E: hand(['10C', '10D', '10H', '10S', '9H', '9S']), // sum 58, not tied
    }
    const winner = firstSeat(hands, makeRng(42))
    expect(['S', 'W']).toContain(winner)
  })

  it('is deterministic for a given rng seed', () => {
    const hands: Record<Seat, Card[]> = {
      S: hand(['2C', '3C', '4C', '5C', '6C', '7C']),
      W: hand(['2D', '3D', '4D', '5D', '6D', '7D']),
      N: hand(['10C', '10D', '10H', '10S', '9C', '9D']),
      E: hand(['10C', '10D', '10H', '10S', '9H', '9S']),
    }
    const a = firstSeat(hands, makeRng(42))
    const b = firstSeat(hands, makeRng(42))
    expect(a).toBe(b)
  })
})

describe('nextSeat', () => {
  it('goes clockwise S -> W -> N -> E -> S when all are alive', () => {
    const alive = SEAT_ORDER
    expect(nextSeat('S', alive)).toBe('W')
    expect(nextSeat('W', alive)).toBe('N')
    expect(nextSeat('N', alive)).toBe('E')
    expect(nextSeat('E', alive)).toBe('S')
  })

  it('skips eliminated seats', () => {
    const alive: Seat[] = ['S', 'N']
    expect(nextSeat('S', alive)).toBe('N')
    expect(nextSeat('N', alive)).toBe('S')
  })

  it('wraps around correctly', () => {
    const alive: Seat[] = ['S', 'W']
    expect(nextSeat('W', alive)).toBe('S')
  })

  it('returns the next alive seat clockwise even if current is no longer alive', () => {
    // current = 'W' is dead; next alive clockwise from W's position is N.
    const alive: Seat[] = ['S', 'N', 'E']
    expect(nextSeat('W', alive)).toBe('N')
  })

  it('throws if aliveSeats is empty', () => {
    expect(() => nextSeat('S', [])).toThrow()
  })
})

describe('newGame', () => {
  it('produces a fully-formed, reproducible GameState for a fixed seed', () => {
    const a = newGame({ seed: 12345 })
    const b = newGame({ seed: 12345 })
    expect(a).toEqual(b)

    expect(a.phase).toBe('playing')
    expect(a.winner).toBeNull()
    expect(a.captures).toEqual([])
    expect(a.moveCount).toBe(0)
    expect(a.lastMove).toBeNull()
    expect(a.events).toEqual([])
    expect(a.aliveSeats).toEqual(['S', 'W', 'N', 'E'])
    expect(a.seed).toBe(12345)
    expect(SEAT_ORDER).toContain(a.turn)

    for (const seat of SEAT_ORDER) {
      expect(a.hands[seat]).toHaveLength(6)
    }
  })

  it('produces different games for different seeds', () => {
    const a = newGame({ seed: 1 })
    const b = newGame({ seed: 2 })
    expect(a).not.toEqual(b)
  })

  it('sets seed to null when no seed is given', () => {
    const state = newGame()
    expect(state.seed).toBeNull()
  })
})
