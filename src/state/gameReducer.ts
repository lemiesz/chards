/**
 * Thin UI layer over the pure engine: which screen is showing, which square is
 * selected, and where that selection may legally move. All rules live in the
 * engine — this reducer only translates taps into engine calls.
 */

import type { GameState, Move, Seat, Square } from '../engine/types'
import { sameSquare, pieceAt } from '../engine/types'
import { newGame } from '../engine/setup'
import type { DeckCount } from '../engine/deck'
import { legalMoves } from '../engine/moves'
import { applyMove, canApply } from '../engine/apply'
import {
  ALL_HUMAN_CONFIG,
  DEFAULT_AI_PACE,
  type AiConfig,
  type AiPace,
} from './aiConfig'

export type Screen = 'home' | 'deal' | 'game' | 'rules' | 'gameover'

export interface AppState {
  readonly screen: Screen
  readonly game: GameState | null
  readonly selected: Square | null
  readonly legalTargets: readonly Square[]
  /** Screen to return to when the rules are dismissed. */
  readonly rulesReturnTo: Screen
  /** Which seats the computer plays; `null` for a seat means a human. */
  readonly aiSeats: AiConfig
  /** How long computer seats pause before moving. */
  readonly aiPace: AiPace
  /**
   * The square each seat last moved a piece away from, for the per-seat
   * last-move markers. Cleared whenever an elimination resets the board, since
   * every piece is re-placed and the old origins mean nothing.
   */
  readonly seatOrigins: Readonly<Record<Seat, Square | null>>
}

const NO_ORIGINS: Readonly<Record<Seat, Square | null>> = {
  S: null,
  W: null,
  N: null,
  E: null,
}

/** Records the mover's origin square, or wipes them all if the board reset. */
function trackOrigin(
  origins: Readonly<Record<Seat, Square | null>>,
  mover: Seat,
  move: Move,
  next: GameState,
): Readonly<Record<Seat, Square | null>> {
  if (next.events.some((event) => event.type === 'reset')) return NO_ORIGINS
  return { ...origins, [mover]: move.from }
}

export type Action =
  | {
      type: 'newGame'
      seed?: number
      aiSeats?: AiConfig
      aiPace?: AiPace
      deckCount?: DeckCount
    }
  | { type: 'startGame' }
  | {
      type: 'resume'
      game: GameState
      aiSeats?: AiConfig
      aiPace?: AiPace
    }
  | { type: 'openRules' }
  | { type: 'closeRules' }
  | { type: 'tapSquare'; square: Square }
  /** Applies an already-chosen move — how the AI takes its turn. */
  | { type: 'playMove'; move: Move }
  | { type: 'goHome' }

export const initialAppState: AppState = {
  screen: 'home',
  game: null,
  selected: null,
  legalTargets: [],
  rulesReturnTo: 'home',
  aiSeats: ALL_HUMAN_CONFIG,
  aiPace: DEFAULT_AI_PACE,
  seatOrigins: NO_ORIGINS,
}

function screenForPhase(game: GameState): Screen {
  return game.phase === 'playing' ? 'game' : 'gameover'
}

export function gameReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'newGame': {
      const game = newGame({
        ...(action.seed === undefined ? {} : { seed: action.seed }),
        deckCount: action.deckCount ?? 1,
      })
      return {
        ...state,
        screen: 'deal',
        game,
        selected: null,
        legalTargets: [],
        aiSeats: action.aiSeats ?? state.aiSeats,
        aiPace: action.aiPace ?? state.aiPace,
        seatOrigins: NO_ORIGINS,
      }
    }

    case 'startGame': {
      if (!state.game) return state
      return { ...state, screen: screenForPhase(state.game) }
    }

    case 'resume': {
      return {
        ...state,
        screen: screenForPhase(action.game),
        game: action.game,
        selected: null,
        legalTargets: [],
        aiSeats: action.aiSeats ?? state.aiSeats,
        aiPace: action.aiPace ?? state.aiPace,
        seatOrigins: NO_ORIGINS,
      }
    }

    case 'playMove': {
      const game = state.game
      if (!game || game.phase !== 'playing' || state.screen !== 'game') {
        return state
      }
      // Guard against a stale move arriving from an AI timer that fired after
      // the position already changed.
      if (!canApply(game, action.move)) return state
      const mover = game.turn
      const next = applyMove(game, action.move)
      return {
        ...state,
        game: next,
        selected: null,
        legalTargets: [],
        screen: screenForPhase(next),
        seatOrigins: trackOrigin(state.seatOrigins, mover, action.move, next),
      }
    }

    case 'openRules':
      return { ...state, screen: 'rules', rulesReturnTo: state.screen }

    case 'closeRules':
      return { ...state, screen: state.rulesReturnTo }

    case 'goHome':
      return { ...initialAppState }

    case 'tapSquare': {
      const game = state.game
      if (!game || game.phase !== 'playing' || state.screen !== 'game') {
        return state
      }
      const { square } = action

      // Tapping a highlighted target commits the move.
      if (
        state.selected &&
        state.legalTargets.some((t) => sameSquare(t, square))
      ) {
        const move = { from: state.selected, to: square }
        const mover = game.turn
        const next = applyMove(game, move)
        return {
          ...state,
          game: next,
          selected: null,
          legalTargets: [],
          screen: screenForPhase(next),
          seatOrigins: trackOrigin(state.seatOrigins, mover, move, next),
        }
      }

      const piece = pieceAt(game.board, square)

      // Tapping your own piece selects it (or re-selects a different one).
      if (piece && piece.owner === game.turn) {
        if (state.selected && sameSquare(state.selected, square)) {
          return { ...state, selected: null, legalTargets: [] }
        }
        return {
          ...state,
          selected: square,
          legalTargets: legalMoves(game, square),
        }
      }

      // Anything else clears the selection and does nothing further.
      return { ...state, selected: null, legalTargets: [] }
    }

    default:
      return state
  }
}
