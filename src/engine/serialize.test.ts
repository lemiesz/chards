import { describe, it, expect } from 'vitest'
import { serialize, deserialize, SAVE_VERSION } from './serialize'
import { newGame } from './setup'
import { applyMove } from './apply'
import { allLegalMoves } from './moves'

describe('serialize / deserialize', () => {
  it('round-trips a fresh game state deep-equal', () => {
    const state = newGame({ seed: 42 })
    const json = serialize(state)
    const restored = deserialize(json)
    expect(restored).toEqual(state)
  })

  it('round-trips a state that has captures, promotion-relevant fields, and non-empty events', () => {
    const state = newGame({ seed: 123 })
    const moves = allLegalMoves(state, state.turn)
    const next = applyMove(state, moves[0])
    const json = serialize(next)
    const restored = deserialize(json)
    expect(restored).toEqual(next)
  })

  it('includes the version field in the serialized payload', () => {
    const state = newGame({ seed: 1 })
    const json = serialize(state)
    const parsed = JSON.parse(json)
    expect(parsed.version).toBe(SAVE_VERSION)
    expect(parsed.state).toBeDefined()
  })

  it('returns null for malformed JSON', () => {
    expect(deserialize('{not valid json')).toBeNull()
    expect(deserialize('')).toBeNull()
    expect(deserialize('undefined')).toBeNull()
  })

  it('returns null for valid JSON that is not an object', () => {
    expect(deserialize('42')).toBeNull()
    expect(deserialize('"hello"')).toBeNull()
    expect(deserialize('null')).toBeNull()
    expect(deserialize('[]')).toBeNull()
  })

  it('returns null when the version is missing or mismatched', () => {
    const state = newGame({ seed: 1 })
    expect(deserialize(JSON.stringify({ state }))).toBeNull()
    expect(deserialize(JSON.stringify({ version: 999, state }))).toBeNull()
    expect(
      deserialize(JSON.stringify({ version: SAVE_VERSION - 1, state })),
    ).toBeNull()
  })

  it('returns null for a structurally invalid state: wrong board shape', () => {
    const state = newGame({ seed: 1 })
    const broken = { ...state, board: [[null, null]] } // not 8x8
    expect(
      deserialize(JSON.stringify({ version: SAVE_VERSION, state: broken })),
    ).toBeNull()
  })

  it('returns null for a structurally invalid state: bad seat', () => {
    const state = newGame({ seed: 1 })
    const broken = { ...state, turn: 'X' }
    expect(
      deserialize(JSON.stringify({ version: SAVE_VERSION, state: broken })),
    ).toBeNull()
  })

  it('returns null for a structurally invalid state: bad phase', () => {
    const state = newGame({ seed: 1 })
    const broken = { ...state, phase: 'paused' }
    expect(
      deserialize(JSON.stringify({ version: SAVE_VERSION, state: broken })),
    ).toBeNull()
  })

  it('returns null when required fields are missing entirely', () => {
    expect(
      deserialize(
        JSON.stringify({ version: SAVE_VERSION, state: { board: [] } }),
      ),
    ).toBeNull()
  })

  it('returns null for a board cell that is not a valid piece', () => {
    const state = newGame({ seed: 1 })
    const board = state.board.map((row) => row.slice())
    ;(board[0] as unknown[])[0] = { owner: 'S' } // missing required piece fields
    const broken = { ...state, board }
    expect(
      deserialize(JSON.stringify({ version: SAVE_VERSION, state: broken })),
    ).toBeNull()
  })
})
