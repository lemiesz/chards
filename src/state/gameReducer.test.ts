import { describe, expect, it } from 'vitest'
import type { GameState, Square } from '../engine/types'
import { pieceAt, sameSquare } from '../engine/types'
import { applyMove, canApply } from '../engine/apply'
import { findSeatPieces } from '../engine/apply'
import { allLegalMoves, legalMoves } from '../engine/moves'
import type { AiConfig } from './aiConfig'
import {
  type Action,
  type AppState,
  gameReducer,
  initialAppState,
} from './gameReducer'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Runs `newGame` + `startGame` so tests land straight on the 'game' screen. */
function startedState(seed: number): AppState {
  const dealt = gameReducer(initialAppState, { type: 'newGame', seed })
  return gameReducer(dealt, { type: 'startGame' })
}

/** First legal move available to the seat on turn — fails loudly if there is none. */
function firstLegalMove(game: GameState) {
  const move = allLegalMoves(game, game.turn)[0]
  if (!move) throw new Error('fixture has no legal move for the seat on turn')
  return move
}

/** An empty square that is not among `targets` — used to test deselect-on-empty-tap. */
function emptyNonTargetSquare(
  game: GameState,
  targets: readonly Square[],
): Square {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square: Square = { row, col }
      if (pieceAt(game.board, square)) continue
      if (targets.some((t) => sameSquare(t, square))) continue
      return square
    }
  }
  throw new Error('fixture has no empty, non-target square')
}

/** Freezes an object graph so any accidental mutation throws in strict mode. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
  }
  return value
}

// ---------------------------------------------------------------------------
// newGame / startGame
// ---------------------------------------------------------------------------

describe('gameReducer: newGame', () => {
  it('produces a game and moves to the deal screen', () => {
    const result = gameReducer(initialAppState, { type: 'newGame', seed: 42 })
    expect(result.screen).toBe('deal')
    expect(result.game).not.toBeNull()
    expect(result.selected).toBeNull()
    expect(result.legalTargets).toEqual([])
  })

  it('the same seed twice produces an identical game state', () => {
    const a = gameReducer(initialAppState, { type: 'newGame', seed: 1234 })
    const b = gameReducer(initialAppState, { type: 'newGame', seed: 1234 })
    expect(a.game).toEqual(b.game)
  })
})

describe('gameReducer: startGame', () => {
  it('moves from deal to the game screen', () => {
    const dealt = gameReducer(initialAppState, { type: 'newGame', seed: 2 })
    const started = gameReducer(dealt, { type: 'startGame' })
    expect(started.screen).toBe('game')
    expect(started.game).toBe(dealt.game)
  })
})

// ---------------------------------------------------------------------------
// aiSeats plumbing on newGame / resume
// ---------------------------------------------------------------------------

describe('gameReducer: aiSeats', () => {
  const customConfig: AiConfig = { S: null, W: 'easy', N: 'hard', E: 'normal' }

  it('newGame carries the given aiSeats through', () => {
    const result = gameReducer(initialAppState, {
      type: 'newGame',
      seed: 30,
      aiSeats: customConfig,
    })
    expect(result.aiSeats).toEqual(customConfig)
  })

  it('newGame without aiSeats preserves the current value', () => {
    const withConfig = gameReducer(initialAppState, {
      type: 'newGame',
      seed: 30,
      aiSeats: customConfig,
    })
    const again = gameReducer(withConfig, { type: 'newGame', seed: 31 })
    expect(again.aiSeats).toEqual(customConfig)
  })

  it('resume carries the given aiSeats through', () => {
    const started = startedState(32)
    const result = gameReducer(initialAppState, {
      type: 'resume',
      game: started.game!,
      aiSeats: customConfig,
    })
    expect(result.aiSeats).toEqual(customConfig)
    expect(result.game).toBe(started.game)
  })

  it('resume without aiSeats preserves the current value', () => {
    const withConfig = gameReducer(initialAppState, {
      type: 'newGame',
      seed: 30,
      aiSeats: customConfig,
    })
    const started = gameReducer(withConfig, { type: 'startGame' })
    const resumed = gameReducer(started, {
      type: 'resume',
      game: started.game!,
    })
    expect(resumed.aiSeats).toEqual(customConfig)
  })
})

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

describe('gameReducer: selection', () => {
  it('tapping your own piece selects it with legalTargets equal to the engine output', () => {
    const started = startedState(3)
    const game = started.game!
    const move = firstLegalMove(game)

    const result = gameReducer(started, {
      type: 'tapSquare',
      square: move.from,
    })

    expect(result.selected).toEqual(move.from)
    expect(result.legalTargets).toEqual(legalMoves(game, move.from))
  })

  it('tapping the same piece again deselects it', () => {
    const started = startedState(4)
    const game = started.game!
    const move = firstLegalMove(game)

    const selected = gameReducer(started, {
      type: 'tapSquare',
      square: move.from,
    })
    const deselected = gameReducer(selected, {
      type: 'tapSquare',
      square: move.from,
    })

    expect(deselected.selected).toBeNull()
    expect(deselected.legalTargets).toEqual([])
  })

  it('tapping an empty non-target square deselects', () => {
    const started = startedState(5)
    const game = started.game!
    const move = firstLegalMove(game)

    const selected = gameReducer(started, {
      type: 'tapSquare',
      square: move.from,
    })
    const emptySquare = emptyNonTargetSquare(game, selected.legalTargets)
    const deselected = gameReducer(selected, {
      type: 'tapSquare',
      square: emptySquare,
    })

    expect(deselected.selected).toBeNull()
    expect(deselected.legalTargets).toEqual([])
  })

  it('tapping an opponent piece does not select it', () => {
    const started = startedState(6)
    const game = started.game!
    const opponentSeat = game.aliveSeats.find((s) => s !== game.turn)!
    const [opponentSquare] = findSeatPieces(game.board, opponentSeat).map(
      (p) => p.square,
    )

    const result = gameReducer(started, {
      type: 'tapSquare',
      square: opponentSquare,
    })

    expect(result.selected).toBeNull()
    expect(result.legalTargets).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Applying a move
// ---------------------------------------------------------------------------

describe('gameReducer: applying a move', () => {
  it('tapping a highlighted target applies the move, advances the turn, and clears selection', () => {
    const started = startedState(7)
    const game = started.game!
    const move = firstLegalMove(game)
    const expectedGame = applyMove(game, move)

    const selected = gameReducer(started, {
      type: 'tapSquare',
      square: move.from,
    })
    expect(selected.legalTargets.some((t) => sameSquare(t, move.to))).toBe(true)

    const applied = gameReducer(selected, {
      type: 'tapSquare',
      square: move.to,
    })

    expect(applied.game).toEqual(expectedGame)
    expect(applied.selected).toBeNull()
    expect(applied.legalTargets).toEqual([])
    expect(applied.screen).toBe(
      expectedGame.phase === 'playing' ? 'game' : 'gameover',
    )
  })
})

// ---------------------------------------------------------------------------
// playMove — how the AI takes its turn
// ---------------------------------------------------------------------------

describe('gameReducer: playMove', () => {
  it('applies a legal move, advances the turn, and clears selection', () => {
    const started = startedState(70)
    const game = started.game!
    const move = firstLegalMove(game)
    const expectedGame = applyMove(game, move)

    const result = gameReducer(started, { type: 'playMove', move })

    expect(result.game).toEqual(expectedGame)
    expect(result.selected).toBeNull()
    expect(result.legalTargets).toEqual([])
    expect(result.screen).toBe(
      expectedGame.phase === 'playing' ? 'game' : 'gameover',
    )
  })

  it('ignores a move that is no longer legal (stale) by returning the same state object', () => {
    const started = startedState(71)
    const game = started.game!
    const move = firstLegalMove(game)
    expect(canApply(game, move)).toBe(true)

    // Play the move once so `move.from` is now empty — replaying the exact
    // same move mimics an AI timer that fired after the position moved on.
    const afterFirst: AppState = {
      ...started,
      game: applyMove(game, move),
    }
    expect(canApply(afterFirst.game!, move)).toBe(false)

    const result = gameReducer(afterFirst, { type: 'playMove', move })

    expect(result).toBe(afterFirst)
  })

  it('ignores a move when the screen is not "game"', () => {
    const dealt = gameReducer(initialAppState, { type: 'newGame', seed: 72 })
    const move = firstLegalMove(dealt.game!)

    const result = gameReducer(dealt, { type: 'playMove', move })

    expect(result).toBe(dealt)
  })

  it('ignores a move when the game is finished', () => {
    const started = startedState(73)
    const move = firstLegalMove(started.game!)
    const finishedGame: GameState = {
      ...started.game!,
      phase: 'finished',
      winner: 'S',
      aliveSeats: ['S'],
    }
    const finishedState: AppState = { ...started, game: finishedGame }

    const result = gameReducer(finishedState, { type: 'playMove', move })

    expect(result).toBe(finishedState)
  })
})

// ---------------------------------------------------------------------------
// Taps that must be ignored
// ---------------------------------------------------------------------------

describe('gameReducer: ignored taps', () => {
  it('ignores taps when the screen is not "game"', () => {
    const dealt = gameReducer(initialAppState, { type: 'newGame', seed: 8 })
    const result = gameReducer(dealt, {
      type: 'tapSquare',
      square: { row: 0, col: 0 },
    })
    expect(result).toBe(dealt)
  })

  it('ignores taps when the game is finished', () => {
    const started = startedState(9)
    const finishedGame: GameState = {
      ...started.game!,
      phase: 'finished',
      winner: 'S',
      aliveSeats: ['S'],
    }
    const finishedState: AppState = { ...started, game: finishedGame }

    const result = gameReducer(finishedState, {
      type: 'tapSquare',
      square: { row: 0, col: 0 },
    })
    expect(result).toBe(finishedState)
  })
})

// ---------------------------------------------------------------------------
// Rules round-trip
// ---------------------------------------------------------------------------

describe('gameReducer: rules round-trip', () => {
  it('returns to the game screen when rules were opened from the game screen', () => {
    const started = startedState(10)
    const opened = gameReducer(started, { type: 'openRules' })
    expect(opened.screen).toBe('rules')
    expect(opened.rulesReturnTo).toBe('game')

    const closed = gameReducer(opened, { type: 'closeRules' })
    expect(closed.screen).toBe('game')
  })

  it('returns to home when rules were opened from home', () => {
    const opened = gameReducer(initialAppState, { type: 'openRules' })
    expect(opened.screen).toBe('rules')
    expect(opened.rulesReturnTo).toBe('home')

    const closed = gameReducer(opened, { type: 'closeRules' })
    expect(closed.screen).toBe('home')
  })
})

// ---------------------------------------------------------------------------
// goHome
// ---------------------------------------------------------------------------

describe('gameReducer: goHome', () => {
  it('resets to the initial state', () => {
    const started = startedState(11)
    const result = gameReducer(started, { type: 'goHome' })
    expect(result).toEqual(initialAppState)
  })
})

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe('gameReducer: immutability', () => {
  it('never mutates the state object it is given', () => {
    const started = startedState(12)
    const game = started.game!
    const move = firstLegalMove(game)
    const before = structuredClone(started)
    const frozen = deepFreeze(started)

    const actions: Action[] = [
      { type: 'tapSquare', square: move.from },
      { type: 'tapSquare', square: move.to },
    ]

    expect(() => {
      let current: AppState = frozen
      for (const action of actions) {
        current = gameReducer(current, action)
      }
    }).not.toThrow()

    expect(frozen).toEqual(before)
  })
})
