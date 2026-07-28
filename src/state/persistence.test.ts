import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newGame } from '../engine/setup'
import { applyMove } from '../engine/apply'
import { allLegalMoves } from '../engine/moves'
import type { GameState } from '../engine/types'
import { ALL_HUMAN_CONFIG, DEFAULT_AI_CONFIG, type AiConfig } from './aiConfig'
import {
  clearSave,
  hasSave,
  loadAiConfig,
  loadGame,
  saveAiConfig,
  saveGame,
} from './persistence'

// Mirrors the private SAVE_KEY/AI_KEY constants in persistence.ts. Kept here
// instead of exporting them from the module, since the keys are an
// implementation detail.
const SAVE_KEY = 'chards:save'
const AI_KEY = 'chards:ai'

/** A game a couple of moves in, so it's structurally more than a fresh deal. */
function midGame(seed: number): GameState {
  let game = newGame({ seed })
  for (let i = 0; i < 2; i++) {
    const move = allLegalMoves(game, game.turn)[0]
    if (!move) break
    game = applyMove(game, move)
  }
  return game
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('persistence: save/load round trip', () => {
  it('round-trips a GameState deep-equal', () => {
    const game = midGame(101)
    saveGame(game)
    expect(loadGame()).toEqual(game)
  })
})

describe('persistence: hasSave', () => {
  it('is false when nothing has been saved', () => {
    expect(hasSave()).toBe(false)
  })

  it('is true after a save', () => {
    saveGame(newGame({ seed: 102 }))
    expect(hasSave()).toBe(true)
  })
})

describe('persistence: clearSave', () => {
  it('removes the save', () => {
    saveGame(newGame({ seed: 103 }))
    expect(hasSave()).toBe(true)

    clearSave()

    expect(hasSave()).toBe(false)
    expect(loadGame()).toBeNull()
  })

  it('also removes the AI config', () => {
    saveGame(newGame({ seed: 103 }))
    saveAiConfig(DEFAULT_AI_CONFIG)
    expect(loadAiConfig()).toEqual(DEFAULT_AI_CONFIG)

    clearSave()

    expect(loadAiConfig()).toBeNull()
  })
})

describe('persistence: AI config save/load round trip', () => {
  it('round-trips the default AI config deep-equal', () => {
    saveAiConfig(DEFAULT_AI_CONFIG)
    expect(loadAiConfig()).toEqual(DEFAULT_AI_CONFIG)
  })

  it('round-trips an all-human AI config deep-equal', () => {
    saveAiConfig(ALL_HUMAN_CONFIG)
    expect(loadAiConfig()).toEqual(ALL_HUMAN_CONFIG)
  })

  it('round-trips a mixed config with every level represented', () => {
    const config: AiConfig = { S: null, W: 'easy', N: 'normal', E: 'hard' }
    saveAiConfig(config)
    expect(loadAiConfig()).toEqual(config)
  })
})

describe('persistence: loadAiConfig invalid input', () => {
  it('returns null when nothing has been stored', () => {
    expect(loadAiConfig()).toBeNull()
  })

  it('returns null for corrupted JSON without throwing', () => {
    window.localStorage.setItem(AI_KEY, 'not valid json {{{')

    let result: AiConfig | null = null
    expect(() => {
      result = loadAiConfig()
    }).not.toThrow()

    expect(result).toBeNull()
  })

  it('returns null for an unknown level string', () => {
    window.localStorage.setItem(
      AI_KEY,
      JSON.stringify({ S: null, W: 'expert', N: 'normal', E: 'normal' }),
    )

    expect(loadAiConfig()).toBeNull()
  })
})

describe('persistence: corrupted or stale saves', () => {
  it('returns null and clears a corrupted save without throwing', () => {
    window.localStorage.setItem(SAVE_KEY, 'not valid json {{{')

    let result: GameState | null = null
    expect(() => {
      result = loadGame()
    }).not.toThrow()

    expect(result).toBeNull()
    expect(window.localStorage.getItem(SAVE_KEY)).toBeNull()
  })

  it('returns null for a save written with a different/older version, without throwing', () => {
    const game = newGame({ seed: 104 })
    window.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ version: 0, state: game }),
    )

    let result: GameState | null = null
    expect(() => {
      result = loadGame()
    }).not.toThrow()

    expect(result).toBeNull()
  })
})

describe('persistence: localStorage failures', () => {
  it('save is a no-op and load returns null when localStorage throws', () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota exceeded')
      })

    expect(() => saveGame(newGame({ seed: 105 }))).not.toThrow()
    setItemSpy.mockRestore()

    const getItemSpy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('access denied')
      })

    let result: GameState | null = null
    expect(() => {
      result = loadGame()
    }).not.toThrow()
    expect(result).toBeNull()
    getItemSpy.mockRestore()
  })
})
