import { useEffect, useMemo, useReducer, useState } from 'react'
import { Board } from './ui/Board'
import { TurnBanner } from './ui/TurnBanner'
import { PlayerPanel } from './ui/PlayerPanel'
import { EventBanner, eventSentences } from './ui/EventBanner'
import { Home } from './ui/screens/Home'
import { Rules } from './ui/screens/Rules'
import { GameOver } from './ui/screens/GameOver'
import { DealReveal } from './ui/screens/DealReveal'
import { gameReducer, initialAppState } from './state/gameReducer'
import {
  loadGame,
  saveGame,
  clearSave,
  saveAiConfig,
  loadAiConfig,
} from './state/persistence'
import { pieceCounts } from './engine/apply'
import { chooseMove } from './engine/ai'
import { SEAT_NAMES, type GameState } from './engine/types'
import './ui/app.css'

/** How long a computer seat "thinks" before its move appears, in ms. */
const AI_MOVE_DELAY = 900

export interface AppProps {
  /**
   * Test-only seam: forces `newGame` to use a fixed seed instead of real
   * randomness, so integration tests can derive the exact dealt game and
   * assert against it. Left undefined in production.
   */
  seed?: number
  /** Test-only seam: shortens the computer's thinking pause. */
  aiDelayMs?: number
}

export default function App({ seed, aiDelayMs = AI_MOVE_DELAY }: AppProps = {}) {
  const [state, dispatch] = useReducer(gameReducer, initialAppState)
  const [savedGame, setSavedGame] = useState<GameState | null>(() => loadGame())

  // Autosave after every move; a finished game clears its save.
  useEffect(() => {
    const game = state.game
    if (!game) return
    if (game.phase === 'playing') {
      saveGame(game)
      saveAiConfig(state.aiSeats)
    } else {
      clearSave()
      setSavedGame(null)
    }
  }, [state.game, state.aiSeats])

  const game = state.game
  const aiLevel =
    game && game.phase === 'playing' ? state.aiSeats[game.turn] : null
  const aiToMove = state.screen === 'game' && aiLevel !== null

  // A computer seat takes its turn after a short pause, so a human watching can
  // see what happened instead of the board jumping several moves at once.
  useEffect(() => {
    if (!game || !aiToMove || aiLevel === null) return
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      const move = chooseMove(game, game.turn, { level: aiLevel })
      // A seat with no legal move is skipped by the engine, so `null` here just
      // means there is nothing to do.
      if (move) dispatch({ type: 'playMove', move })
    }, aiDelayMs)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [game, aiToMove, aiLevel, aiDelayMs])

  const counts = useMemo(
    () => (state.game ? pieceCounts(state.game.board) : null),
    [state.game],
  )

  // After an elimination every piece is re-placed on its back row, so the
  // last move's from/to squares no longer describe anything on the board.
  const justReset = Boolean(
    state.game?.events.some((event) => event.type === 'reset'),
  )

  if (state.screen === 'rules') {
    return (
      <main className="app app--screen">
        <Rules onBack={() => dispatch({ type: 'closeRules' })} />
      </main>
    )
  }

  if (state.screen === 'home' || !game) {
    return (
      <main className="app app--screen">
        <Home
          hasSave={savedGame !== null}
          onNewGame={(aiSeats) => {
            clearSave()
            setSavedGame(null)
            dispatch({ type: 'newGame', seed, aiSeats })
          }}
          onResume={() => {
            const saved = loadGame()
            if (saved) {
              dispatch({
                type: 'resume',
                game: saved,
                aiSeats: loadAiConfig() ?? undefined,
              })
            } else {
              setSavedGame(null)
            }
          }}
          onRules={() => dispatch({ type: 'openRules' })}
        />
      </main>
    )
  }

  if (state.screen === 'deal') {
    return (
      <main className="app app--screen">
        <DealReveal
          hands={game.hands}
          firstSeat={game.turn}
          onStart={() => dispatch({ type: 'startGame' })}
        />
      </main>
    )
  }

  if (state.screen === 'gameover') {
    return (
      <main className="app app--screen">
        <GameOver
          winner={game.winner}
          onRematch={() => dispatch({ type: 'newGame', seed })}
          onHome={() => dispatch({ type: 'goHome' })}
        />
      </main>
    )
  }

  return (
    <main className="app">
      <header className="app__top">
        <TurnBanner turn={game.turn} phase={game.phase} winner={game.winner} />
        <button
          type="button"
          className="btn btn--ghost app__rules-btn"
          onClick={() => dispatch({ type: 'openRules' })}
        >
          Rules
        </button>
      </header>

      {/*
        A single fixed-height slot for the "thinking" indicator and the event
        banner. Both come and go constantly during play (especially with
        computer opponents), and the old code rendered them as siblings that
        appeared/disappeared — every appearance shoved the board down a few
        pixels. Keeping one always-present element here, sized by CSS to fit
        its tallest normal content, means the board's vertical position never
        moves regardless of what (if anything) is showing.

        The event banner takes priority over the thinking indicator: the
        move that, say, eliminates a seat also hands the turn to the next
        (often computer) seat in the very same render, so if "thinking" won
        that race the elimination would never be visible at all.
      */}
      <div className="app__status">
        {eventSentences(game.events).length > 0 ? (
          <EventBanner events={game.events} />
        ) : aiToMove ? (
          <div className="ai-thinking" role="status" aria-live="polite">
            <span className="ai-thinking__dot" aria-hidden="true" />
            {SEAT_NAMES[game.turn]} is thinking…
          </div>
        ) : null}
      </div>

      <div className="app__board">
        <Board
          board={game.board}
          selected={state.selected}
          legalTargets={state.legalTargets}
          lastMove={justReset ? null : game.lastMove}
          moveSeq={game.moveCount}
          seatOrigins={state.seatOrigins}
          onSquareTap={(square) => dispatch({ type: 'tapSquare', square })}
          aliveSeats={game.aliveSeats}
          turn={game.turn}
          disabled={aiToMove}
        />
      </div>

      {counts && (
        <PlayerPanel state={game} pieceCounts={counts} aiSeats={state.aiSeats} />
      )}
    </main>
  )
}
